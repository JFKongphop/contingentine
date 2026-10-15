// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {CRERoundKeeper} from "../src/CRERoundKeeper.sol";

contract StubRounds {
  uint8 public pending = 2;
  uint256 public rolls;

  function setPending(uint8 p) external {
    pending = p;
  }

  function performUpkeep(bytes calldata) external {
    require(pending != 0, "Rounds: nothing to do");
    rolls++;
    pending = 0;
  }
}

contract CRERoundKeeperTest is Test {
  StubRounds rounds;
  CRERoundKeeper keeper;
  address forwarder = address(0xF0);
  bytes32 constant WORKFLOW = keccak256("round-keeper");

  function setUp() public {
    rounds = new StubRounds();
    keeper = new CRERoundKeeper(address(rounds), forwarder);
  }

  function _metadata(bytes32 id) internal pure returns (bytes memory) {
    return abi.encodePacked(id, bytes10("name"), address(0xA11CE));
  }

  function test_forwarderReportRollsTheRound() public {
    vm.prank(forwarder);
    keeper.onReport(_metadata(WORKFLOW), "");
    assertEq(rounds.rolls(), 1);
    assertEq(keeper.rolled(), 1);
    assertEq(keeper.lastRolledAt(), block.timestamp);
  }

  function test_onlyForwarderMayDeliver() public {
    vm.expectRevert("Keeper: not forwarder");
    keeper.onReport(_metadata(WORKFLOW), "");
  }

  function test_lateReportIsConsumedNotReverted() public {
    rounds.setPending(0);
    vm.prank(forwarder);
    keeper.onReport(_metadata(WORKFLOW), "");
    assertEq(keeper.delivered(), 1);
    assertEq(keeper.rolled(), 0);
    assertEq(rounds.rolls(), 0);
  }

  function test_workflowIdIsEnforcedWhenSet() public {
    keeper.setExpectedWorkflowId(WORKFLOW);
    vm.prank(forwarder);
    vm.expectRevert("Keeper: wrong workflow");
    keeper.onReport(_metadata(keccak256("someone else")), "");

    // the simulator sends no metadata, which must not pass once a workflow is pinned
    vm.prank(forwarder);
    vm.expectRevert("Keeper: wrong workflow");
    keeper.onReport("", "");

    vm.prank(forwarder);
    keeper.onReport(_metadata(WORKFLOW), "");
    assertEq(keeper.rolled(), 1);
  }

  function test_reportContentCannotSteerTheKeeper() public {
    vm.prank(forwarder);
    keeper.onReport(_metadata(WORKFLOW), abi.encodeWithSignature("transferOwnership(address)", address(0xBAD)));
    assertEq(keeper.owner(), address(this));
    assertEq(rounds.rolls(), 1);
  }

  function test_ownerControls() public {
    vm.prank(address(0xBAD));
    vm.expectRevert("Keeper: not owner");
    keeper.setForwarder(address(0xBAD));

    keeper.setForwarder(address(0xF1));
    vm.prank(forwarder);
    vm.expectRevert("Keeper: not forwarder");
    keeper.onReport("", "");
  }

  function test_advertisesTheReceiverInterface() public view {
    assertTrue(keeper.supportsInterface(0x805f2132)); // onReport(bytes,bytes)
    assertTrue(keeper.supportsInterface(0x01ffc9a7)); // ERC-165
    assertFalse(keeper.supportsInterface(0xffffffff));
  }
}
