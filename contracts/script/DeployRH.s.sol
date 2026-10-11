// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RHChainVault} from "../src/RHChainVault.sol";
import {MockMorpho} from "../src/mocks/MockMorpho.sol";

/// Deploys one MockMorpho per stock token, then RHChainVault, to Robinhood Chain
/// testnet. Reads everything from contracts/.env.
contract DeployRH is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        string[] memory names = new string[](5);
        names[0] = "TSLA";
        names[1] = "AMZN";
        names[2] = "AMD";
        names[3] = "NFLX";
        names[4] = "PLTR";

        address[] memory tokens = new address[](5);
        tokens[0] = vm.envAddress("TOKEN_TSLA");
        tokens[1] = vm.envAddress("TOKEN_AMZN");
        tokens[2] = vm.envAddress("TOKEN_AMD");
        tokens[3] = vm.envAddress("TOKEN_NFLX");
        tokens[4] = vm.envAddress("TOKEN_PLTR");

        vm.startBroadcast(pk);

        address[] memory strategies = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            MockMorpho m = new MockMorpho(
                IERC20(tokens[i]),
                string.concat("Mock Morpho ", names[i]),
                string.concat("mm", names[i])
            );
            strategies[i] = address(m);
            console.log(string.concat("MockMorpho ", names[i], ":"), address(m));
        }

        RHChainVault vault = new RHChainVault(deployer, vm.envAddress("OPERATOR"), tokens, strategies);

        vm.stopBroadcast();

        console.log("RHChainVault deployed at:", address(vault));
        console.log("owner:", deployer);
    }
}