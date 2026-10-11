// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Circle's CoreDepositWallet on HyperEVM: credits USDC to a HyperCore account.
///         destinationId: 0 = perps account, type(uint32).max = spot.
interface ICoreDepositWallet {
    function depositFor(address recipient, uint256 amount, uint32 destinationId) external;
}

/// @title NovaSIPVault
/// @notice Hub of NovaSIP on HyperEVM: holds the USDC of the Hyperliquid side and keeps ONE
///         ledger per user for both the Hyperliquid side and the Robinhood Chain side.
///
/// Money rules (the whole security story):
///  - Nobody can send user funds to an arbitrary address. USDC leaves this contract only
///    (a) to the user who owns it (withdraw / exitAll / claimYield),
///    (b) to the fixed `tradingAccount` on HyperCore (operator: deployToCore),
///    (c) to the fixed `treasury`, only as the early-exit fee of the user who is exiting.
///  - The owner can only call `setOperator`. There is no admin withdraw and no pause.
///  - Yield is claimable only after the operator has funded it with real USDC.
///
/// Yield: every deposit is its own record (amount, tier, time). Each tier has a current APY
/// reported by the operator. Pending yield = remaining x tier APY x time, settled whenever
/// the tier or the remaining amount changes. It is an estimate; only credited yield is paid.
contract NovaSIPVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RiskTier {
        Conservative,
        Balanced,
        Aggressive
    }

    enum Side {
        Hub, // USDC held here / on HyperCore
        Robinhood // held in the Robinhood Chain vault, recorded here only
    }

    struct Deposit {
        uint256 amount; // original deposit (6 decimals), never changes
        uint256 remaining; // still invested
        uint256 yieldCredited; // real yield credited to this deposit
        uint256 pendingBase; // estimated yield accrued before the last settle
        uint256 indexSnap; // tier index at the last settle
        uint64 timestamp;
        RiskTier tier;
        Side side;
        bool isSip;
    }

    struct DepositView {
        Deposit rec;
        uint256 pending; // estimated yield not yet credited, right now
    }

    struct Sip {
        uint256 amount;
        uint64 nextAt;
        uint32 interval;
        RiskTier tier;
        bool active;
    }

    struct Rate {
        uint256 apyBps; // 1000 = 10%
        uint256 lastUpdate;
        uint256 accIndex; // accumulated yield per unit of principal, 1e18 scale
    }

    struct Position {
        uint256 hubPrincipal;
        uint256 rhPrincipal;
        uint256 yieldOwed; // credited, not yet claimed
        uint256 totalYieldEarned; // credited over all time
        uint256 pendingYield; // estimate, not yet credited
        uint64 goalDate; // 0 = no goal set
    }

    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10_000;
    uint256 private constant PRECISION = 1e18;
    uint256 public constant MAX_APY_BPS = 10_000; // sanity cap: 100%
    uint256 public constant MAX_EXIT_FEE_BPS = 1_000; // fee can never be set above 10%
    uint32 public constant MIN_SIP_INTERVAL = 60; // seconds

    // ───────────── fixed at deployment ─────────────
    IERC20 public immutable asset; // USDC on HyperEVM
    ICoreDepositWallet public immutable coreDepositWallet;
    address public immutable tradingAccount; // the one HyperCore account that receives deployed funds
    uint32 public immutable coreDex; // 0 = perps
    address public immutable treasury; // receives early-exit fees
    uint256 public immutable exitFeeBps; // fee on principal withdrawn before the goal date

    // ───────────── state ─────────────
    address public operator;

    mapping(address => Deposit[]) private _deposits; // full history, never deleted
    mapping(address => uint256) public hubPrincipal;
    mapping(address => uint256) public rhPrincipal;
    mapping(address => Sip) public sips;
    mapping(address => uint64) public goalDate;
    mapping(address => uint256) public yieldOwed;
    mapping(address => uint256) public totalYieldEarned;
    Rate[3] private _rates;

    uint256 public totalHubPrincipal;
    uint256 public deployedToCore;
    uint256 public yieldReserve; // funded yield not yet claimed
    uint256 public totalYieldOwed; // part of yieldReserve already credited to users

    // ───────────── events ─────────────
    event OperatorSet(address indexed operator);
    event Deposited(address indexed user, uint256 indexed index, uint256 amount, RiskTier tier, Side side, bool isSip);
    event Withdrawn(address indexed user, uint256 amount, uint256 fee);
    event RHWithdrawalRecorded(address indexed user, uint256 amount);
    event GoalSet(address indexed user, uint64 goalDate);
    event SipSet(address indexed user, uint256 amount, uint32 interval, RiskTier tier);
    event SipCancelled(address indexed user);
    event SipExecuted(address indexed user, uint256 amount, uint64 nextAt);
    event RiskTierUpdated(address indexed user, RiskTier tier);
    event TierApySet(RiskTier indexed tier, uint256 apyBps);
    event YieldFunded(uint256 amount);
    event YieldCredited(address indexed user, uint256 indexed index, uint256 amount);
    event YieldClaimed(address indexed user, uint256 amount);
    event DeployedToCore(uint256 amount);
    event CoreReturnAcknowledged(uint256 amount);

    // ───────────── errors ─────────────
    error NotOperator();
    error ZeroAmount();
    error ZeroAddress();
    error FeeTooHigh();
    error InsufficientPrincipal();
    error FundsDeployed();
    error GoalInPast();
    error GoalCannotMoveEarlier();
    error SipInactive();
    error SipNotDue();
    error SipIntervalTooShort();
    error ApyTooHigh();
    error InvalidIndex();
    error YieldNotFunded();
    error NothingToClaim();
    error DeployExceedsPrincipal();
    error DeployDidNotMoveFunds();
    error ReturnExceedsDeployed();
    error ReturnNotReceived();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(
        address initialOwner,
        address operator_,
        address asset_,
        address coreDepositWallet_,
        address tradingAccount_,
        uint32 coreDex_,
        address treasury_,
        uint256 exitFeeBps_
    ) Ownable(initialOwner) {
        if (
            asset_ == address(0) || coreDepositWallet_ == address(0) || tradingAccount_ == address(0)
                || treasury_ == address(0)
        ) revert ZeroAddress();
        if (exitFeeBps_ > MAX_EXIT_FEE_BPS) revert FeeTooHigh();
        asset = IERC20(asset_);
        coreDepositWallet = ICoreDepositWallet(coreDepositWallet_);
        tradingAccount = tradingAccount_;
        coreDex = coreDex_;
        treasury = treasury_;
        exitFeeBps = exitFeeBps_;
        operator = operator_;
        for (uint256 i; i < 3; i++) {
            _rates[i].lastUpdate = block.timestamp;
        }
        emit OperatorSet(operator_);
    }

    /// @notice The only power the owner has. Set to address(0) to disable the operator.
    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
        emit OperatorSet(newOperator);
    }

    // ═════════════ user ═════════════

    function deposit(uint256 amount, RiskTier tier) external nonReentrant {
        _depositFrom(msg.sender, amount, tier, false);
    }

    /// @notice Commit to a goal date. Withdrawing principal before it costs the early-exit fee.
    ///         The date can only be moved later, never earlier.
    function setGoal(uint64 date) external {
        if (date <= block.timestamp) revert GoalInPast();
        if (date < goalDate[msg.sender]) revert GoalCannotMoveEarlier();
        goalDate[msg.sender] = date;
        emit GoalSet(msg.sender, date);
    }

    /// @notice Withdraw principal, oldest deposit first. Before the goal date the early-exit fee
    ///         applies. Only USDC that is in this contract can be paid: if the operator has put
    ///         funds on HyperCore, they must be brought back first.
    function withdraw(uint256 amount) external nonReentrant {
        _withdraw(msg.sender, amount);
    }

    /// @notice Emergency exit: all principal on the hub side (early-exit fee applies before the
    ///         goal date) plus all credited yield. Also cancels the SIP.
    function exitAll() external nonReentrant {
        uint256 principal = hubPrincipal[msg.sender];
        uint256 owed = yieldOwed[msg.sender];
        if (principal == 0 && owed == 0) revert ZeroAmount();
        delete sips[msg.sender];
        emit SipCancelled(msg.sender);
        if (principal > 0) _withdraw(msg.sender, principal);
        if (owed > 0) _claim(msg.sender);
    }

    function claimYield() external nonReentrant {
        if (yieldOwed[msg.sender] == 0) revert NothingToClaim();
        _claim(msg.sender);
    }

    /// @notice Move all of the caller's live deposits and their SIP to a new tier.
    ///         Yield accrued so far at the old tier is settled first.
    function updateRiskTier(RiskTier tier) external {
        Deposit[] storage list = _deposits[msg.sender];
        for (uint256 i; i < list.length; i++) {
            Deposit storage d = list[i];
            if (d.remaining == 0 || d.tier == tier) continue;
            _settle(d);
            d.tier = tier;
            d.indexSnap = _tierIndex(tier);
        }
        if (sips[msg.sender].active) sips[msg.sender].tier = tier;
        emit RiskTierUpdated(msg.sender, tier);
    }

    // ═════════════ SIP ═════════════

    /// @notice Recurring deposit. The user must also approve this contract for USDC.
    function setSip(uint256 amount, uint32 interval, RiskTier tier) external {
        if (amount == 0) revert ZeroAmount();
        if (interval < MIN_SIP_INTERVAL) revert SipIntervalTooShort();
        sips[msg.sender] =
            Sip({amount: amount, nextAt: uint64(block.timestamp) + interval, interval: interval, tier: tier, active: true});
        emit SipSet(msg.sender, amount, interval, tier);
    }

    function cancelSip() external {
        delete sips[msg.sender];
        emit SipCancelled(msg.sender);
    }

    /// @notice Run a due SIP. Anyone may call it (cron job / keeper): it can only pull the amount
    ///         the user configured, once per interval, from the user's own approval.
    function triggerSIP(address user) external nonReentrant {
        Sip storage s = sips[user];
        if (!s.active) revert SipInactive();
        if (block.timestamp < s.nextAt) revert SipNotDue();

        uint64 next = s.nextAt + s.interval;
        if (next <= block.timestamp) next = uint64(block.timestamp) + s.interval; // skip missed periods
        s.nextAt = next;

        _depositFrom(user, s.amount, s.tier, true);
        emit SipExecuted(user, s.amount, next);
    }

    // ═════════════ operator ═════════════

    /// @notice Record funds the user holds in the Robinhood Chain vault (no tokens move here).
    function recordRHDeposit(address user, uint256 amount, RiskTier tier) external onlyOperator {
        if (amount == 0) revert ZeroAmount();
        rhPrincipal[user] += amount;
        _push(user, amount, tier, Side.Robinhood, false);
    }

    function recordRHWithdrawal(address user, uint256 amount) external onlyOperator {
        if (amount == 0) revert ZeroAmount();
        if (amount > rhPrincipal[user]) revert InsufficientPrincipal();
        _consume(user, Side.Robinhood, amount);
        rhPrincipal[user] -= amount;
        emit RHWithdrawalRecorded(user, amount);
    }

    /// @notice Report the current real APY of a tier. Yield already accrued is kept.
    function setTierApy(RiskTier tier, uint256 apyBps) external onlyOperator {
        if (apyBps > MAX_APY_BPS) revert ApyTooHigh();
        Rate storage r = _rates[uint8(tier)];
        r.accIndex = _tierIndex(tier);
        r.lastUpdate = block.timestamp;
        r.apyBps = apyBps;
        emit TierApySet(tier, apyBps);
    }

    /// @notice Bring real USDC (realised profit) into the contract so it can be credited.
    function fundYield(uint256 amount) external onlyOperator nonReentrant {
        if (amount == 0) revert ZeroAmount();
        yieldReserve += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit YieldFunded(amount);
    }

    /// @notice Credit realised yield to one deposit record. Cannot exceed funded USDC.
    ///         The estimate for that record is replaced by the real number.
    function updateYield(address user, uint256 index, uint256 amount) external onlyOperator {
        if (amount == 0) revert ZeroAmount();
        if (index >= _deposits[user].length) revert InvalidIndex();
        if (totalYieldOwed + amount > yieldReserve) revert YieldNotFunded();

        Deposit storage d = _deposits[user][index];
        d.yieldCredited += amount;
        d.pendingBase = 0;
        d.indexSnap = _tierIndex(d.tier);

        yieldOwed[user] += amount;
        totalYieldOwed += amount;
        totalYieldEarned[user] += amount;
        emit YieldCredited(user, index, amount);
    }

    /// @notice Send hub USDC to the fixed trading account on HyperCore.
    function deployToCore(uint256 amount) external onlyOperator nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (deployedToCore + amount > totalHubPrincipal) revert DeployExceedsPrincipal();
        uint256 balBefore = asset.balanceOf(address(this));

        deployedToCore += amount;
        asset.forceApprove(address(coreDepositWallet), amount);
        coreDepositWallet.depositFor(tradingAccount, amount, coreDex);
        asset.forceApprove(address(coreDepositWallet), 0);

        if (balBefore - asset.balanceOf(address(this)) != amount) revert DeployDidNotMoveFunds();
        emit DeployedToCore(amount);
    }

    /// @notice After USDC has been sent back to this contract, reduce the deployed counter.
    ///         Reverts unless the USDC has really arrived.
    function acknowledgeCoreReturn(uint256 amount) external onlyOperator {
        if (amount == 0) revert ZeroAmount();
        if (amount > deployedToCore) revert ReturnExceedsDeployed();
        deployedToCore -= amount;
        if (asset.balanceOf(address(this)) < totalHubPrincipal - deployedToCore + yieldReserve) {
            revert ReturnNotReceived();
        }
        emit CoreReturnAcknowledged(amount);
    }

    // ═════════════ views ═════════════

    /// @notice Everything a dashboard needs about one user.
    function getPosition(address user) external view returns (Position memory p) {
        p.hubPrincipal = hubPrincipal[user];
        p.rhPrincipal = rhPrincipal[user];
        p.yieldOwed = yieldOwed[user];
        p.totalYieldEarned = totalYieldEarned[user];
        p.goalDate = goalDate[user];
        Deposit[] storage list = _deposits[user];
        for (uint256 i; i < list.length; i++) {
            p.pendingYield += _pending(list[i]);
        }
    }

    /// @notice Full deposit history (both sides), oldest first, with estimated pending yield.
    function getDeposits(address user) external view returns (DepositView[] memory out) {
        Deposit[] storage list = _deposits[user];
        out = new DepositView[](list.length);
        for (uint256 i; i < list.length; i++) {
            out[i] = DepositView({rec: list[i], pending: _pending(list[i])});
        }
    }

    function tierApyBps(RiskTier tier) external view returns (uint256) {
        return _rates[uint8(tier)].apyBps;
    }

    // ═════════════ internal ═════════════

    function _depositFrom(address user, uint256 amount, RiskTier tier, bool isSip) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 index = _push(user, amount, tier, Side.Hub, isSip);
        hubPrincipal[user] += amount;
        totalHubPrincipal += amount;
        asset.safeTransferFrom(user, address(this), amount);
        emit Deposited(user, index, amount, tier, Side.Hub, isSip);
    }

    function _push(address user, uint256 amount, RiskTier tier, Side side, bool isSip) internal returns (uint256 index) {
        index = _deposits[user].length;
        _deposits[user].push(
            Deposit({
                amount: amount,
                remaining: amount,
                yieldCredited: 0,
                pendingBase: 0,
                indexSnap: _tierIndex(tier),
                timestamp: uint64(block.timestamp),
                tier: tier,
                side: side,
                isSip: isSip
            })
        );
        if (side == Side.Robinhood) emit Deposited(user, index, amount, tier, side, isSip);
    }

    function _withdraw(address user, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > hubPrincipal[user]) revert InsufficientPrincipal();
        if (amount > _withdrawable()) revert FundsDeployed();

        _consume(user, Side.Hub, amount);
        hubPrincipal[user] -= amount;
        totalHubPrincipal -= amount;

        uint256 fee = block.timestamp < goalDate[user] ? (amount * exitFeeBps) / BPS : 0;
        asset.safeTransfer(user, amount - fee);
        if (fee > 0) asset.safeTransfer(treasury, fee);
        emit Withdrawn(user, amount, fee);
    }

    function _claim(address user) internal {
        uint256 amount = yieldOwed[user];
        yieldOwed[user] = 0;
        totalYieldOwed -= amount;
        yieldReserve -= amount;
        asset.safeTransfer(user, amount);
        emit YieldClaimed(user, amount);
    }

    /// @dev Hub principal that can leave right now: not on HyperCore and not reserved for yield.
    function _withdrawable() internal view returns (uint256) {
        uint256 bal = asset.balanceOf(address(this));
        uint256 free = bal > yieldReserve ? bal - yieldReserve : 0;
        uint256 notDeployed = totalHubPrincipal - deployedToCore;
        return free < notDeployed ? free : notDeployed;
    }

    /// @dev Oldest first, only records of `side`. Settles each touched record so yield accrued
    ///      on the withdrawn part is kept.
    function _consume(address user, Side side, uint256 amount) internal {
        Deposit[] storage list = _deposits[user];
        uint256 left = amount;
        for (uint256 i; i < list.length && left > 0; i++) {
            Deposit storage d = list[i];
            if (d.side != side || d.remaining == 0) continue;
            _settle(d);
            uint256 take = d.remaining < left ? d.remaining : left;
            d.remaining -= take;
            left -= take;
        }
        if (left != 0) revert InsufficientPrincipal();
    }

    // ═════════════ time-weighted yield ═════════════

    /// @dev Yield per unit of principal accumulated by a tier so far (1e18 scale).
    function _tierIndex(RiskTier tier) internal view returns (uint256) {
        Rate storage r = _rates[uint8(tier)];
        return r.accIndex + (r.apyBps * (block.timestamp - r.lastUpdate) * PRECISION) / (YEAR * BPS);
    }

    function _pending(Deposit storage d) internal view returns (uint256) {
        return d.pendingBase + (d.remaining * (_tierIndex(d.tier) - d.indexSnap)) / PRECISION;
    }

    function _settle(Deposit storage d) internal {
        d.pendingBase = _pending(d);
        d.indexSnap = _tierIndex(d.tier);
    }
}