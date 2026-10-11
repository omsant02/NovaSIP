// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NovaSIPVault} from "../src/NovaSIPVault.sol";

/// Deploys NovaSIPVault to HyperEVM testnet. Reads everything from contracts/.env.
contract DeployHyperEVM is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        NovaSIPVault vault = new NovaSIPVault(
            deployer, // owner (can only call setOperator)
            vm.envAddress("OPERATOR"),
            vm.envAddress("USDC"),
            vm.envAddress("CORE_DEPOSIT_WALLET"),
            vm.envAddress("TRADING_ACCOUNT"),
            type(uint32).max, // coreDex: spot (perps destination failed on testnet)
            vm.envAddress("TREASURY"),
            100 // early-exit fee: 1%
        );
        vm.stopBroadcast();

        console.log("NovaSIPVault deployed at:", address(vault));
        console.log("owner:", deployer);
    }
}
