// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test double with the same ship / pull / dock / rawBalances behaviour as 1inch Aqua (Aqua.sol pins
///      solc 0.8.30, so the real contract cannot be compiled into this 0.8.26 project). The deployed app talks
///      to the real Aqua on Ethereum Sepolia.
contract MockAqua {
  uint8 constant DOCKED = type(uint8).max;

  struct Balance {
    uint248 amount;
    uint8 tokensCount;
  }

  mapping(address => mapping(address => mapping(bytes32 => mapping(address => Balance)))) internal _balances;

  function rawBalances(address maker, address app, bytes32 strategyHash, address token)
    external
    view
    returns (uint248, uint8)
  {
    Balance memory b = _balances[maker][app][strategyHash][token];
    return (b.amount, b.tokensCount);
  }

  function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts)
    external
    returns (bytes32 strategyHash)
  {
    strategyHash = keccak256(strategy);
    for (uint256 i = 0; i < tokens.length; i++) {
      Balance storage b = _balances[msg.sender][app][strategyHash][tokens[i]];
      require(b.tokensCount == 0, "StrategiesMustBeImmutable");
      (b.amount, b.tokensCount) = (uint248(amounts[i]), uint8(tokens.length));
    }
  }

  function dock(address app, bytes32 strategyHash, address[] calldata tokens) external {
    for (uint256 i = 0; i < tokens.length; i++) {
      Balance storage b = _balances[msg.sender][app][strategyHash][tokens[i]];
      require(b.tokensCount == tokens.length, "DockingShouldCloseAllTokens");
      (b.amount, b.tokensCount) = (0, DOCKED);
    }
  }

  function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external {
    Balance storage b = _balances[maker][msg.sender][strategyHash][token];
    b.amount -= uint248(amount);
    require(IERC20(token).transferFrom(maker, to, amount), "transfer failed");
  }
}
