// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICREReceiver {
  function onReport(bytes calldata metadata, bytes calldata report) external;
  function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IRoundUpkeep {
  function pending() external view returns (uint8);
  function performUpkeep(bytes calldata performData) external;
}

/// @title CRERoundKeeper - lets a Chainlink Runtime Environment (CRE) workflow roll Contingent's rounds
/// @notice Chainlink Automation was retired in favour of CRE. A CRE workflow runs off-chain on a Chainlink
///         DON: on a schedule it reads `RoundManager.checkUpkeep`, and when a round is due the DON signs a
///         report that Chainlink's forwarder delivers here. This contract then calls `performUpkeep`.
///
///         The report carries no instructions: whatever it says, the only thing this contract can do is ask
///         the RoundManager to roll, and the RoundManager re-checks every condition itself. So a wrong or
///         early report costs gas and changes nothing.
contract CRERoundKeeper is ICREReceiver {
  IRoundUpkeep public immutable rounds;
  address public owner;
  /// @notice the only address allowed to deliver reports (Chainlink's forwarder on this chain)
  address public forwarder;
  /// @notice when set, only reports from this workflow are accepted
  bytes32 public expectedWorkflowId;

  uint256 public delivered;
  uint256 public rolled;
  uint64 public lastRolledAt;

  event Rolled(uint8 action, bytes32 indexed workflowId);
  event Skipped(bytes reason, bytes32 indexed workflowId);
  event ForwarderSet(address forwarder);
  event WorkflowSet(bytes32 workflowId);

  constructor(address rounds_, address forwarder_) {
    require(rounds_ != address(0) && forwarder_ != address(0), "Keeper: zero address");
    rounds = IRoundUpkeep(rounds_);
    forwarder = forwarder_;
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Keeper: not owner");
    _;
  }

  function setForwarder(address forwarder_) external onlyOwner {
    require(forwarder_ != address(0), "Keeper: zero address");
    forwarder = forwarder_;
    emit ForwarderSet(forwarder_);
  }

  function setExpectedWorkflowId(bytes32 id) external onlyOwner {
    expectedWorkflowId = id;
    emit WorkflowSet(id);
  }

  function transferOwnership(address to) external onlyOwner {
    require(to != address(0), "Keeper: zero address");
    owner = to;
  }

  /// @inheritdoc ICREReceiver
  function onReport(bytes calldata metadata, bytes calldata) external override {
    require(msg.sender == forwarder, "Keeper: not forwarder");
    // metadata starts with the 32-byte workflow id; the simulator's forwarder sends none
    bytes32 workflowId = metadata.length >= 32 ? bytes32(metadata[:32]) : bytes32(0);
    require(expectedWorkflowId == bytes32(0) || workflowId == expectedWorkflowId, "Keeper: wrong workflow");

    delivered++;
    uint8 action = rounds.pending();
    // a report that arrives after someone else already rolled the round is consumed, not retried
    try rounds.performUpkeep("") {
      rolled++;
      lastRolledAt = uint64(block.timestamp);
      emit Rolled(action, workflowId);
    } catch (bytes memory reason) {
      emit Skipped(reason, workflowId);
    }
  }

  /// @inheritdoc ICREReceiver
  function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
    // IReceiver (onReport) and IERC165
    return interfaceId == ICREReceiver.onReport.selector || interfaceId == 0x01ffc9a7;
  }
}
