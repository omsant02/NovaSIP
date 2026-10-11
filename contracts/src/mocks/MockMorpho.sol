// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice TESTNET ONLY. Stand-in for a Morpho-style lending vault over one token.
///         Real Morpho is not deployed for these tokens on Robinhood testnet.
///         "Yield" is simulated: send tokens straight to this contract and the
///         share price rises for everyone holding shares.
contract MockMorpho is ERC4626 {
    constructor(IERC20 asset_, string memory name_, string memory symbol_)
        ERC4626(asset_)
        ERC20(name_, symbol_)
    {}
}