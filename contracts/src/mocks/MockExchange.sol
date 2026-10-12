// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice TESTNET ONLY. Stand-in for a DEX on Robinhood Chain testnet, which has no
///         live venue for stock tokens. Swaps stock token <-> USDG against its own
///         inventory at a price the price updater sets from real market data.
///         A 0.1% fee stays in the pool. Prices go stale after 1 day.
contract MockExchange is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 10;
    uint256 public constant MAX_PRICE_AGE = 1 days;

    IERC20 public immutable usdg;
    address public priceUpdater;

    /// @dev price = USDG base units per 1 whole stock token (e.g. 378.96 USDG = 378_960_000)
    struct Quote {
        uint192 price;
        uint64 updatedAt;
    }

    mapping(address => Quote) public quotes;

    error NotPriceUpdater();
    error ZeroAddress();
    error ZeroAmount();
    error ZeroPrice();
    error NoPrice();
    error StalePrice();
    error BadPair();
    error SlippageExceeded();
    error InsufficientLiquidity();

    event PriceSet(address indexed token, uint256 price);
    event PriceUpdaterSet(address indexed updater);
    event Swap(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    modifier onlyPriceUpdater() {
        if (msg.sender != priceUpdater) revert NotPriceUpdater();
        _;
    }

    constructor(address initialOwner, IERC20 usdg_, address priceUpdater_) Ownable(initialOwner) {
        if (address(usdg_) == address(0) || priceUpdater_ == address(0)) revert ZeroAddress();
        usdg = usdg_;
        priceUpdater = priceUpdater_;
        emit PriceUpdaterSet(priceUpdater_);
    }

    // ───────────── pricing ─────────────

    function setPrice(address token, uint256 price) external onlyPriceUpdater {
        if (price == 0) revert ZeroPrice();
        quotes[token] = Quote(uint192(price), uint64(block.timestamp));
        emit PriceSet(token, price);
    }

    function setPriceUpdater(address updater) external onlyOwner {
        if (updater == address(0)) revert ZeroAddress();
        priceUpdater = updater;
        emit PriceUpdaterSet(updater);
    }

    // ───────────── swapping ─────────────

    /// @notice Swap exactly `amountIn` of tokenIn for tokenOut. One side must be USDG,
    ///         the other a token with a fresh price. Reverts if output < minOut.
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        amountOut = getAmountOut(tokenIn, tokenOut, amountIn);
        if (amountOut < minOut) revert SlippageExceeded();
        if (IERC20(tokenOut).balanceOf(address(this)) < amountOut) revert InsufficientLiquidity();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Output for a swap at the current price, after the fee.
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        address usdgAddr = address(usdg);
        uint256 gross;
        if (tokenOut == usdgAddr && tokenIn != usdgAddr) {
            // stock -> USDG
            uint256 price = _freshPrice(tokenIn);
            gross = (amountIn * price) / (10 ** IERC20Metadata(tokenIn).decimals());
        } else if (tokenIn == usdgAddr && tokenOut != usdgAddr) {
            // USDG -> stock
            uint256 price = _freshPrice(tokenOut);
            gross = (amountIn * (10 ** IERC20Metadata(tokenOut).decimals())) / price;
        } else {
            revert BadPair();
        }
        return (gross * (10_000 - FEE_BPS)) / 10_000;
    }

    function _freshPrice(address token) internal view returns (uint256) {
        Quote memory q = quotes[token];
        if (q.price == 0) revert NoPrice();
        if (block.timestamp > q.updatedAt + MAX_PRICE_AGE) revert StalePrice();
        return q.price;
    }

    // ───────────── inventory ─────────────

    /// @notice Testnet inventory management: owner can pull tokens out.
    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}