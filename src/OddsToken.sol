// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OddsToken - the YES or NO side of Contingent's rolling odds pool
/// @notice Trading YES against NO on Uniswap v4 moves the published probability that hedges are priced off.
///         Testnet version: anyone can mint, and the tokens are NOT redeemable for the outcome yet, so the
///         pool shows price discovery mechanics, not a funded prediction market.
contract OddsToken is ERC20 {
  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
