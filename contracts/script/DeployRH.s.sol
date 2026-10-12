// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RHChainVault} from "../src/RHChainVault.sol";
import {MockMorpho} from "../src/mocks/MockMorpho.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockExchange} from "../src/mocks/MockExchange.sol";

/// Deploys to Robinhood Chain testnet: MockUSDG, a MockMorpho vault over it,
/// MockExchange, and RHChainVault. Mints USDG to the exchange and the operator.
/// Reads PRIVATE_KEY, OPERATOR and TOKEN_* from contracts/.env.
contract DeployRH is Script {
    uint256 constant EXCHANGE_USDG = 1_000_000e6;
    uint256 constant OPERATOR_USDG = 100_000e6;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address operator = vm.envAddress("OPERATOR");

        address[] memory tokens = new address[](5);
        tokens[0] = vm.envAddress("TOKEN_TSLA");
        tokens[1] = vm.envAddress("TOKEN_AMZN");
        tokens[2] = vm.envAddress("TOKEN_AMD");
        tokens[3] = vm.envAddress("TOKEN_NFLX");
        tokens[4] = vm.envAddress("TOKEN_PLTR");

        vm.startBroadcast(pk);

        MockUSDG usdg = new MockUSDG(deployer);
        MockMorpho morpho = new MockMorpho(IERC20(address(usdg)), "Mock Morpho USDG", "mmUSDG");
        MockExchange exchange = new MockExchange(deployer, IERC20(address(usdg)), operator);
        RHChainVault vault = new RHChainVault(
            deployer, operator, tokens, address(exchange), address(usdg), address(morpho)
        );

        usdg.mint(address(exchange), EXCHANGE_USDG);
        usdg.mint(operator, OPERATOR_USDG);

        vm.stopBroadcast();

        console.log("MockUSDG:      ", address(usdg));
        console.log("MockMorpho:    ", address(morpho));
        console.log("MockExchange:  ", address(exchange));
        console.log("RHChainVault:  ", address(vault));
        console.log("owner:         ", deployer);
        console.log("operator:      ", operator);
    }
}