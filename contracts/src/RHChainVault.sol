// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RHChainVault
/// @notice Custody, books and strategy movement for tokenized stocks on Robinhood
///         Chain. Spoke of the NovaSIP hub (NovaSIPVault on HyperEVM). The two
///         contracts never call each other; the operator mirrors events into the hub
///         with recordRHDeposit / recordRHWithdrawal.
///
/// Trust model:
///  - Token list and one strategy vault per token are fixed at deployment.
///    No admin withdraw, no pause.
///  - Tokens leave this contract only to (a) the user who owns them, or (b) the fixed
///    ERC-4626 strategy of that token (operator: allocate). Nowhere else.
///  - The operator can recall tokens from the strategy, recognise real gains as yield
///    (never more than the surplus that actually exists), and credit that yield.
///  - The owner can only change the operator.
///
/// Known limits:
///  - Strategy losses are not reported: if the strategy returns less than was put in,
///    users' books still show the full principal.
///  - Recall returns principal first; gains appear as surplus only after all deployed
///    principal of that token is back (conservative on purpose).
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

    // ───────────── state ─────────────
    address public operator;
    address[] private _tokens;
    mapping(address => bool) public isAllowed;
    mapping(address => address) public strategyOf; // token => its ERC-4626 strategy

    mapping(address => mapping(address => uint256)) public balanceOf; // user => token => held
    mapping(address => uint256) public totalBalance; // token => sum of user balances
    mapping(address => uint256) public deployed; // token => principal currently in the strategy
    mapping(address => uint256) public depositCount; // user => number of deposits

    mapping(address => uint256) public yieldReserve; // token => set aside for yield, not yet claimed
    mapping(address => uint256) public totalYieldOwed; // token => credited, not yet claimed
    mapping(address => mapping(address => uint256)) public yieldOwed; // user => token
    mapping(address => mapping(address => uint256)) public totalYieldEarned; // user => token

    // ───────────── errors ─────────────
    error ZeroAddress();
    error ZeroAmount();
    error NoTokens();
    error LengthMismatch();
    error DuplicateToken();
    error StrategyAssetMismatch();
    error TokenNotAllowed();
    error InsufficientBalance();
    error NotOperator();
    error YieldNotFunded();
    error NothingToClaim();
    error DeployExceedsPrincipal();
    error DeployDidNotMoveFunds();
    error FundsDeployed();
    error NoSurplus();

    // ───────────── events ─────────────
    event OperatorSet(address indexed operator);
    event Deposited(address indexed user, address indexed token, uint256 amount, RiskTier tier, uint256 depositId);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Allocated(address indexed token, uint256 amount, uint256 shares);
    event Recalled(address indexed token, uint256 shares, uint256 received, uint256 principalBack);
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
        address[] memory strategies_
    ) Ownable(initialOwner) {
        if (operator_ == address(0)) revert ZeroAddress();
        if (tokens_.length == 0) revert NoTokens();
        if (tokens_.length != strategies_.length) revert LengthMismatch();
        operator = operator_;
        for (uint256 i = 0; i < tokens_.length; i++) {
            address t = tokens_[i];
            address s = strategies_[i];
            if (t == address(0) || s == address(0)) revert ZeroAddress();
            if (isAllowed[t]) revert DuplicateToken();
            if (IERC4626(s).asset() != t) revert StrategyAssetMismatch();
            isAllowed[t] = true;
            strategyOf[t] = s;
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
    ///         token is deployed in the strategy; the operator must recall first.
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balanceOf[msg.sender][token];
        if (amount > bal) revert InsufficientBalance();

        uint256 newTotal = totalBalance[token] - amount;
        if (newTotal < deployed[token]) revert FundsDeployed();

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

    // ═════════════ operator functions ═════════════

    /// @notice Move idle user principal of a token into that token's fixed strategy.
    function allocate(address token, uint256 amount) external onlyOperator nonReentrant {
        address strategy = strategyOf[token];
        if (strategy == address(0)) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();
        if (deployed[token] + amount > totalBalance[token]) revert DeployExceedsPrincipal();

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        deployed[token] += amount;
        IERC20(token).forceApprove(strategy, amount);
        uint256 shares = IERC4626(strategy).deposit(amount, address(this));
        IERC20(token).forceApprove(strategy, 0);
        if (balBefore - IERC20(token).balanceOf(address(this)) != amount) revert DeployDidNotMoveFunds();

        emit Allocated(token, amount, shares);
    }

    /// @notice Pull tokens back out of the strategy. Principal is returned first; anything
    ///         above the deployed principal becomes surplus (see recognizeYield).
    function recall(address token, uint256 shares) external onlyOperator nonReentrant {
        address strategy = strategyOf[token];
        if (strategy == address(0)) revert TokenNotAllowed();
        if (shares == 0) revert ZeroAmount();

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC4626(strategy).redeem(shares, address(this), address(this));
        uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;

        uint256 principalBack = received < deployed[token] ? received : deployed[token];
        deployed[token] -= principalBack;
        emit Recalled(token, shares, received, principalBack);
    }

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

    /// @notice Tokens held beyond user principal (not deployed) and the yield reserve.
    function surplus(address token) public view returns (uint256) {
        uint256 owedOut = (totalBalance[token] - deployed[token]) + yieldReserve[token];
        uint256 bal = IERC20(token).balanceOf(address(this));
        return bal > owedOut ? bal - owedOut : 0;
    }

    /// @notice Current value, in the token, of what this vault holds in the strategy.
    function strategyAssets(address token) external view returns (uint256) {
        IERC4626 s = IERC4626(strategyOf[token]);
        return s.convertToAssets(IERC20(address(s)).balanceOf(address(this)));
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