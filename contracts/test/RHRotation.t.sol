// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RHChainVault} from "../src/RHChainVault.sol";
import {MockMorpho} from "../src/mocks/MockMorpho.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockExchange} from "../src/mocks/MockExchange.sol";

contract MockStock is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RHRotationTest is Test {
    MockStock tsla;
    MockStock amzn;
    MockUSDG usdg;
    MockMorpho morpho;
    MockExchange exchange;
    RHChainVault vault;

    address operator = makeAddr("operator");
    address alice = makeAddr("alice");

    function setUp() public {
        tsla = new MockStock("Tesla", "TSLA");
        amzn = new MockStock("Amazon", "AMZN");
        usdg = new MockUSDG(address(this));
        morpho = new MockMorpho(IERC20(address(usdg)), "Mock Morpho USDG", "mmUSDG");
        exchange = new MockExchange(address(this), IERC20(address(usdg)), operator);

        address[] memory tokens = new address[](2);
        tokens[0] = address(tsla);
        tokens[1] = address(amzn);
        vault = new RHChainVault(address(this), operator, tokens, address(exchange), address(usdg), address(morpho));

        usdg.mint(address(exchange), 1_000_000e6);
        tsla.mint(address(exchange), 1_000e18);

        vm.prank(operator);
        exchange.setPrice(address(tsla), 400e6);

        tsla.mint(alice, 100e18);
        vm.prank(alice);
        tsla.approve(address(vault), type(uint256).max);
    }

    function _deposit(uint256 amount) internal {
        vm.prank(alice);
        vault.deposit(address(tsla), amount, RHChainVault.RiskTier.Balanced);
    }

    // ───────────── basics ─────────────

    function test_deposit_credits_books() public {
        _deposit(10e18);
        assertEq(vault.balanceOf(alice, address(tsla)), 10e18);
        assertEq(vault.totalBalance(address(tsla)), 10e18);
        assertEq(tsla.balanceOf(address(vault)), 10e18);
    }

    function test_deposit_rejects_unlisted_token() public {
        MockStock other = new MockStock("Other", "OTH");
        other.mint(alice, 1e18);
        vm.startPrank(alice);
        other.approve(address(vault), 1e18);
        vm.expectRevert(RHChainVault.TokenNotAllowed.selector);
        vault.deposit(address(other), 1e18, RHChainVault.RiskTier.Balanced);
        vm.stopPrank();
    }

    function test_withdraw_returns_tokens() public {
        _deposit(10e18);
        vm.prank(alice);
        vault.withdraw(address(tsla), 4e18);
        assertEq(vault.balanceOf(alice, address(tsla)), 6e18);
        assertEq(tsla.balanceOf(alice), 94e18);
    }

    // ───────────── rotation ─────────────

    function test_sell_records_rotation() public {
        _deposit(10e18);
        vm.prank(operator);
        vault.sellToUsdg(address(tsla), 10e18, 3_990e6);

        // 10 * 400 = 4000 USDG minus 0.1% fee = 3996
        assertEq(vault.rotatedStock(address(tsla)), 10e18);
        assertEq(vault.usdgIdle(address(tsla)), 3_996e6);
        assertEq(usdg.balanceOf(address(vault)), 3_996e6);
        assertEq(tsla.balanceOf(address(vault)), 0);
    }

    function test_full_cycle_sell_park_unpark_buyback_yield() public {
        _deposit(10e18);

        vm.startPrank(operator);
        vault.sellToUsdg(address(tsla), 10e18, 3_990e6);
        vault.parkUsdg(address(tsla), 3_996e6);
        vm.stopPrank();

        assertEq(vault.usdgIdle(address(tsla)), 0);
        assertGt(vault.parkedShares(address(tsla)), 0);

        // simulated Morpho yield: 40 USDG lands in the vault
        usdg.mint(address(morpho), 40e6);

        vm.startPrank(operator);
        vault.unparkUsdg(address(tsla), vault.parkedShares(address(tsla)));
        vm.stopPrank();

        assertApproxEqAbs(vault.usdgIdle(address(tsla)), 4_036e6, 5);

        // price falls, buy the stock back: more units than were sold
        vm.prank(operator);
        exchange.setPrice(address(tsla), 380e6);

        uint256 idle = vault.usdgIdle(address(tsla));
        vm.prank(operator);
        vault.buyBackStock(address(tsla), idle, 10e18);

        assertEq(vault.rotatedStock(address(tsla)), 0);
        assertEq(vault.usdgIdle(address(tsla)), 0);

        uint256 extra = vault.surplus(address(tsla));
        assertGt(extra, 0.6e18);

        // surplus becomes yield, alice claims it and withdraws everything
        vm.startPrank(operator);
        vault.recognizeYield(address(tsla), extra);
        vault.creditYield(alice, address(tsla), extra);
        vm.stopPrank();

        vm.startPrank(alice);
        vault.claimYield(address(tsla));
        vault.withdraw(address(tsla), 10e18);
        vm.stopPrank();

        assertEq(tsla.balanceOf(alice), 100e18 + extra);
        assertEq(vault.balanceOf(alice, address(tsla)), 0);
    }

    function test_withdraw_blocked_while_rotated() public {
        _deposit(10e18);
        vm.prank(operator);
        vault.sellToUsdg(address(tsla), 10e18, 0);

        vm.prank(alice);
        vm.expectRevert(RHChainVault.FundsRotated.selector);
        vault.withdraw(address(tsla), 1e18);
    }

    function test_partial_rotation_leaves_idle_withdrawable() public {
        _deposit(10e18);
        vm.prank(operator);
        vault.sellToUsdg(address(tsla), 4e18, 0);

        vm.startPrank(alice);
        vault.withdraw(address(tsla), 6e18);
        vm.expectRevert(RHChainVault.FundsRotated.selector);
        vault.withdraw(address(tsla), 1e18);
        vm.stopPrank();
    }

    // ───────────── safety rules ─────────────

    function test_buyback_reverts_if_price_rose() public {
        _deposit(10e18);
        vm.prank(operator);
        vault.sellToUsdg(address(tsla), 10e18, 0);

        vm.startPrank(operator);
        exchange.setPrice(address(tsla), 420e6);
        vm.expectRevert(MockExchange.SlippageExceeded.selector);
        vault.buyBackStock(address(tsla), 3_996e6, 10e18);
        vm.stopPrank();
    }

    function test_cannot_rotate_more_than_principal() public {
        _deposit(10e18);
        vm.prank(operator);
        vm.expectRevert(RHChainVault.RotateExceedsPrincipal.selector);
        vault.sellToUsdg(address(tsla), 11e18, 0);
    }

    function test_cannot_rotate_unlisted_token() public {
        vm.prank(operator);
        vm.expectRevert(RHChainVault.TokenNotAllowed.selector);
        vault.sellToUsdg(address(0xBEEF), 1e18, 0);
    }

    function test_only_operator_can_rotate() public {
        _deposit(10e18);
        vm.prank(alice);
        vm.expectRevert(RHChainVault.NotOperator.selector);
        vault.sellToUsdg(address(tsla), 1e18, 0);
    }

    function test_cannot_park_more_than_idle_usdg() public {
        _deposit(10e18);
        vm.startPrank(operator);
        vault.sellToUsdg(address(tsla), 10e18, 0);
        vm.expectRevert(RHChainVault.InsufficientUsdg.selector);
        vault.parkUsdg(address(tsla), 4_000e6);
        vm.stopPrank();
    }

    function test_cannot_recognize_more_than_surplus() public {
        _deposit(10e18);
        vm.prank(operator);
        vm.expectRevert(RHChainVault.NoSurplus.selector);
        vault.recognizeYield(address(tsla), 1);
    }

    function test_stale_price_blocks_swap() public {
        _deposit(10e18);
        vm.warp(block.timestamp + 2 days);
        vm.prank(operator);
        vm.expectRevert(MockExchange.StalePrice.selector);
        vault.sellToUsdg(address(tsla), 1e18, 0);
    }

    function test_exchange_pair_must_include_usdg() public {
        vm.expectRevert(MockExchange.BadPair.selector);
        exchange.getAmountOut(address(tsla), address(amzn), 1e18);
    }

    // ───────────── fuzz ─────────────

    /// A round trip at an unchanged price must never make the trader richer.
    function testFuzz_roundtrip_never_profits(uint256 amt) public {
        amt = bound(amt, 1e15, 500e18);
        address trader = makeAddr("trader");
        tsla.mint(trader, amt);

        vm.startPrank(trader);
        tsla.approve(address(exchange), type(uint256).max);
        usdg.approve(address(exchange), type(uint256).max);
        uint256 gotUsdg = exchange.swap(address(tsla), address(usdg), amt, 0);
        uint256 backStock = exchange.swap(address(usdg), address(tsla), gotUsdg, 0);
        vm.stopPrank();

        assertLe(backStock, amt);
    }
}