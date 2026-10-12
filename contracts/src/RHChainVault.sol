// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IExchange {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        returns (uint256 amountOut);
}

/// @title RHChainVault
/// @notice Custody, books and rotation for tokenized stocks on Robinhood Chain. Spoke
///         of the NovaSIP hub (NovaSIPVault on HyperEVM). The two contracts never call
///         each other; the operator mirrors events into the hub with
///         recordRHDeposit / recordRHWithdrawal.
///
/// How rotation works:
///  - Users deposit allowed stock tokens. Books stay denominated in the stock token.
///  - The operator can sell idle stock for USDG on the fixed exchange (sellToUsdg),
///    park that USDG in the fixed ERC-4626 USDG vault (parkUsdg) to earn yield, take
///    it back out (unparkUsdg), and buy the stock back (buyBackStock).
///  - buyBackStock reverts unless the vault receives at least as many stock units as
///    the principal it restores. Users' stock principal therefore never shrinks;
///    anything extra (cheaper re-entry plus USDG yield) becomes surplus stock, which
///    the operator can recognise as yield and credit to users.
///
/// Trust model:
///  - Token list, exchange, USDG and USDG vault are fixed at deployment.
///    No admin withdraw, no pause.
///  - Tokens leave this contract only to (a) the user who owns them, or (b) the fixed
///    exchange (stock for USDG) or the fixed USDG vault. Nowhere else.
///  - The operator can never take more stock out than idle user principal, and can
///    only recognise yield out of surplus that actually exists.
///  - The owner can only change the operator.
///
/// Known limits:
///  - The no-loss rule is only as strong as the exchange price. On testnet the
///    exchange price is set by our operator from real market data; on mainnet the
///    same vault would swap through a real DEX.
///  - While stock is rotated, withdrawals of that stock revert until the operator
///    buys it back. If the price rises after a sale, the vault waits in USDG.
///  - Accounting is pooled per token, not per user.
///  - Tokens that rebase or charge transfer fees are credited by the amount actually
///    received; later rebases are not reflected. Tokens sent here by mistake are stuck.
contract RHChainVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RiskTier {
        Conservative,
        Balanced,
        Aggressive
    }

    // ───────────── fixed at deployment ─────────────
    IExchange public immutable exchange;
    IERC20 public immutable usdg;
    IERC4626 public immutable usdgVault;

    // ───────────── state ─────────────
    address public operator;
    address[] private _tokens;
    mapping(address => bool) public isAllowed;

    mapping(address => mapping(address => uint256)) public balanceOf; // user => token => held
    mapping(address => uint256) public totalBalance; // token => sum of user balances
    mapping(address => uint256) public depositCount; // user => number of deposits

    // rotation, per stock token
    mapping(address => uint256) public rotatedStock; // stock units currently sold
    mapping(address => uint256) public usdgIdle; // USDG held for this token, not parked
    mapping(address => uint256) public parkedShares; // USDG-vault shares held for this token

    mapping(address => uint256) public yieldReserve; // token => set aside for yield, not yet claimed
    mapping(address => uint256) public totalYieldOwed; // token => credited, not yet claimed
    mapping(address => mapping(address => uint256)) public yieldOwed; // user => token
    mapping(address => mapping(address => uint256)) public totalYieldEarned; // user => token

    // ───────────── errors ─────────────
    error ZeroAddress();
    error ZeroAmount();
    error NoTokens();
    error DuplicateToken();
    error TokenIsUsdg();
    error UsdgVaultAssetMismatch();
    error TokenNotAllowed();
    error InsufficientBalance();
    error NotOperator();
    error YieldNotFunded();
    error NothingToClaim();
    error FundsRotated();
    error NoSurplus();
    error RotateExceedsPrincipal();
    error InsufficientUsdg();
    error InsufficientShares();
    error SwapDidNotMoveFunds();
    error RestoreExceedsRotated();
    error BuyBackBelowPrincipal();

    // ───────────── events ─────────────
    event OperatorSet(address indexed operator);
    event Deposited(address indexed user, address indexed token, uint256 amount, RiskTier tier, uint256 depositId);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Rotated(address indexed token, uint256 stockSold, uint256 usdgReceived);
    event Parked(address indexed token, uint256 usdgAmount, uint256 shares);
    event Unparked(address indexed token, uint256 shares, uint256 usdgReceived);
    event BoughtBack(address indexed token, uint256 usdgSpent, uint256 stockReceived, uint256 stockRestored);
    event YieldFunded(address indexed token, uint256 amount);
    event YieldRecognized(address indexed token, uint256 amount);
    event YieldCredited(address indexed user, address indexed token, uint256 amount);
    event YieldClaimed(address indexed user, address indexed token, uint256 amount);

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(
        address initialOwner,
        address operator_,
        address[] memory tokens_,
        address exchange_,
        address usdg_,
        address usdgVault_
    ) Ownable(initialOwner) {
        if (operator_ == address(0) || exchange_ == address(0) || usdg_ == address(0) || usdgVault_ == address(0)) {
            revert ZeroAddress();
        }
        if (tokens_.length == 0) revert NoTokens();
        if (IERC4626(usdgVault_).asset() != usdg_) revert UsdgVaultAssetMismatch();

        operator = operator_;
        exchange = IExchange(exchange_);
        usdg = IERC20(usdg_);
        usdgVault = IERC4626(usdgVault_);

        for (uint256 i = 0; i < tokens_.length; i++) {
            address t = tokens_[i];
            if (t == address(0)) revert ZeroAddress();
            if (t == usdg_) revert TokenIsUsdg();
            if (isAllowed[t]) revert DuplicateToken();
            isAllowed[t] = true;
            _tokens.push(t);
        }
        emit OperatorSet(operator_);
    }

    // ═════════════ user functions ═════════════

    /// @notice Deposit an allowed stock token. Credits the amount actually received.
    ///         The tier is only recorded in the event; the hub is where tiers matter.
    function deposit(address token, uint256 amount, RiskTier tier) external nonReentrant {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;
        if (received == 0) revert ZeroAmount();

        balanceOf[msg.sender][token] += received;
        totalBalance[token] += received;
        uint256 id = depositCount[msg.sender]++;
        emit Deposited(msg.sender, token, received, tier, id);
    }

    /// @notice Take your tokens back, up to your balance. Reverts if too much of the
    ///         token is rotated into USDG; the operator must buy it back first.
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balanceOf[msg.sender][token];
        if (amount > bal) revert InsufficientBalance();

        uint256 newTotal = totalBalance[token] - amount;
        if (newTotal < rotatedStock[token]) revert FundsRotated();

        balanceOf[msg.sender][token] = bal - amount;
        totalBalance[token] = newTotal;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Claim yield that the operator has funded or recognised and credited to you.
    function claimYield(address token) external nonReentrant {
        uint256 owed = yieldOwed[msg.sender][token];
        if (owed == 0) revert NothingToClaim();

        yieldOwed[msg.sender][token] = 0;
        totalYieldOwed[token] -= owed;
        yieldReserve[token] -= owed;
        IERC20(token).safeTransfer(msg.sender, owed);
        emit YieldClaimed(msg.sender, token, owed);
    }

    // ═════════════ operator: rotation ═════════════

    /// @notice Sell idle stock for USDG on the fixed exchange.
    function sellToUsdg(address token, uint256 amount, uint256 minUsdgOut) external onlyOperator nonReentrant {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();
        if (rotatedStock[token] + amount > totalBalance[token]) revert RotateExceedsPrincipal();

        uint256 stockBefore = IERC20(token).balanceOf(address(this));
        uint256 usdgBefore = usdg.balanceOf(address(this));

        IERC20(token).forceApprove(address(exchange), amount);
        exchange.swap(token, address(usdg), amount, minUsdgOut);
        IERC20(token).forceApprove(address(exchange), 0);

        if (stockBefore - IERC20(token).balanceOf(address(this)) != amount) revert SwapDidNotMoveFunds();
        uint256 got = usdg.balanceOf(address(this)) - usdgBefore;
        if (got == 0) revert ZeroAmount();

        rotatedStock[token] += amount;
        usdgIdle[token] += got;
        emit Rotated(token, amount, got);
    }

    /// @notice Put idle USDG (held for a stock token) into the USDG vault to earn yield.
    function parkUsdg(address token, uint256 amount) external onlyOperator nonReentrant {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();
        if (amount > usdgIdle[token]) revert InsufficientUsdg();

        uint256 usdgBefore = usdg.balanceOf(address(this));
        usdgIdle[token] -= amount;
        usdg.forceApprove(address(usdgVault), amount);
        uint256 shares = usdgVault.deposit(amount, address(this));
        usdg.forceApprove(address(usdgVault), 0);
        if (usdgBefore - usdg.balanceOf(address(this)) != amount) revert SwapDidNotMoveFunds();

        parkedShares[token] += shares;
        emit Parked(token, amount, shares);
    }

    /// @notice Take USDG back out of the USDG vault. Any yield lands in the idle USDG.
    function unparkUsdg(address token, uint256 shares) external onlyOperator nonReentrant {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (shares == 0) revert ZeroAmount();
        if (shares > parkedShares[token]) revert InsufficientShares();

        uint256 usdgBefore = usdg.balanceOf(address(this));
        parkedShares[token] -= shares;
        usdgVault.redeem(shares, address(this), address(this));
        uint256 received = usdg.balanceOf(address(this)) - usdgBefore;

        usdgIdle[token] += received;
        emit Unparked(token, shares, received);
    }

    /// @notice Spend idle USDG to buy the stock back. Reverts unless at least
    ///         `stockToRestore` units come back; that amount of principal is restored
    ///         and anything extra becomes surplus.
    function buyBackStock(address token, uint256 usdgAmount, uint256 stockToRestore)
        external
        onlyOperator
        nonReentrant
    {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (usdgAmount == 0 || stockToRestore == 0) revert ZeroAmount();
        if (usdgAmount > usdgIdle[token]) revert InsufficientUsdg();
        if (stockToRestore > rotatedStock[token]) revert RestoreExceedsRotated();

        uint256 stockBefore = IERC20(token).balanceOf(address(this));
        uint256 usdgBefore = usdg.balanceOf(address(this));

        usdg.forceApprove(address(exchange), usdgAmount);
        exchange.swap(address(usdg), token, usdgAmount, stockToRestore);
        usdg.forceApprove(address(exchange), 0);

        if (usdgBefore - usdg.balanceOf(address(this)) != usdgAmount) revert SwapDidNotMoveFunds();
        uint256 received = IERC20(token).balanceOf(address(this)) - stockBefore;
        if (received < stockToRestore) revert BuyBackBelowPrincipal();

        usdgIdle[token] -= usdgAmount;
        rotatedStock[token] -= stockToRestore;
        emit BoughtBack(token, usdgAmount, received, stockToRestore);
    }

    // ═════════════ operator: yield ═════════════

    /// @notice Turn real surplus (tokens held beyond what users and the yield reserve
    ///         are owed) into yield reserve. Cannot exceed the surplus that exists.
    function recognizeYield(address token, uint256 amount) external onlyOperator {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();
        if (amount > surplus(token)) revert NoSurplus();

        yieldReserve[token] += amount;
        emit YieldRecognized(token, amount);
    }

    /// @notice Bring real tokens in so they can be credited as yield.
    function fundYield(address token, uint256 amount) external onlyOperator nonReentrant {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;
        if (received == 0) revert ZeroAmount();

        yieldReserve[token] += received;
        emit YieldFunded(token, received);
    }

    /// @notice Credit yield to a user. Cannot exceed what is in the yield reserve.
    function creditYield(address user, address token, uint256 amount) external onlyOperator {
        if (!isAllowed[token]) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();
        if (totalYieldOwed[token] + amount > yieldReserve[token]) revert YieldNotFunded();

        yieldOwed[user][token] += amount;
        totalYieldOwed[token] += amount;
        totalYieldEarned[user][token] += amount;
        emit YieldCredited(user, token, amount);
    }

    // ═════════════ owner ═════════════

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        operator = newOperator;
        emit OperatorSet(newOperator);
    }

    // ═════════════ views ═════════════

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    /// @notice Stock held beyond user principal (not rotated) and the yield reserve.
    function surplus(address token) public view returns (uint256) {
        uint256 owedOut = (totalBalance[token] - rotatedStock[token]) + yieldReserve[token];
        uint256 bal = IERC20(token).balanceOf(address(this));
        return bal > owedOut ? bal - owedOut : 0;
    }

    /// @notice Rotation state for one stock token. parkedAssets is the current USDG
    ///         value of the shares parked in the USDG vault.
    function rotation(address token)
        external
        view
        returns (uint256 stockRotated, uint256 usdgIdleAmount, uint256 shares, uint256 parkedAssets)
    {
        stockRotated = rotatedStock[token];
        usdgIdleAmount = usdgIdle[token];
        shares = parkedShares[token];
        parkedAssets = usdgVault.convertToAssets(shares);
    }

    /// @notice Everything a dashboard needs for one user, one row per allowed token.
    function getBalances(address user)
        external
        view
        returns (
            address[] memory tokenList,
            uint256[] memory held,
            uint256[] memory owed,
            uint256[] memory earned
        )
    {
        uint256 n = _tokens.length;
        tokenList = _tokens;
        held = new uint256[](n);
        owed = new uint256[](n);
        earned = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address t = _tokens[i];
            held[i] = balanceOf[user][t];
            owed[i] = yieldOwed[user][t];
            earned[i] = totalYieldEarned[user][t];
        }
    }
}