// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CofheTest} from "@cofhe/foundry-plugin/contracts/CofheTest.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {ConfidentialUSDG} from "../src/ConfidentialUSDG.sol";
import {ConfidentialCollateral} from "../src/ConfidentialCollateral.sol";
import {ConfidentialPositionManager} from "../src/ConfidentialPositionManager.sol";
import {ConfidentialPerp} from "../src/ConfidentialPerp.sol";
import {EventMarket} from "../src/EventMarket.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";
import {PositionNFT} from "../src/PositionNFT.sol";
import {ContingentHedge} from "../src/ContingentHedge.sol";
import {ProtectedPerp} from "../src/ProtectedPerp.sol";
import {PriceThresholdResolver} from "../src/resolvers/PriceThresholdResolver.sol";
import {RoundManager} from "../src/RoundManager.sol";

contract RoundManagerTest is CofheTest {
  MockUSDG usdg;
  MockAggregatorV3 feed;
  EventMarket market;
  PriceThresholdResolver resolver;
  UnderwriterVault vault;
  ContingentHedge hedge;
  ProtectedPerp protected;
  RoundManager rounds;

  function setUp() public {
    deployMocks();
    vm.warp(1_760_000_000);
    usdg = new MockUSDG();
    feed = new MockAggregatorV3(8, 2500e8);
    ConfidentialUSDG cusdg = new ConfidentialUSDG(address(usdg));
    ConfidentialCollateral collateral = new ConfidentialCollateral(address(cusdg));
    ConfidentialPositionManager pm = new ConfidentialPositionManager();
    market = new EventMarket();
    resolver = new PriceThresholdResolver();
    vault = new UnderwriterVault(address(usdg));
    SettlementRouter router = new SettlementRouter(address(vault));
    PositionNFT nft = new PositionNFT();
    hedge = new ContingentHedge(
      address(market), address(collateral), address(pm), address(cusdg), address(vault), address(nft), address(router)
    );
    ConfidentialPerp perp = new ConfidentialPerp(address(usdg), address(cusdg), address(collateral), address(feed));
    protected = new ProtectedPerp(address(perp), address(hedge), bytes32(0));
    vault.authorise(address(hedge), true);

    rounds =
      new RoundManager(address(feed), address(market), address(resolver), address(vault), address(hedge), address(protected));
    market.transferOwnership(address(rounds));
    resolver.transferOwnership(address(rounds));
    protected.transferOwnership(address(rounds));
    vault.authorise(address(rounds), true);

    usdg.mint(address(this), 100_000e6);
    usdg.approve(address(vault), type(uint256).max);
    vault.deposit(100_000e6);
  }

  function _needed() internal view returns (bool needed) {
    (needed,) = rounds.checkUpkeep("");
  }

  function test_firstUpkeepOpensRoundBelowSpot() public {
    assertTrue(_needed());
    rounds.performUpkeep("");

    (bytes32 e, int256 strike, uint64 deadline) = rounds.rounds(1);
    assertEq(strike, 2375e8); // 2,500 − 5%
    assertEq(deadline, block.timestamp + 1 days);
    assertEq(protected.eventId(), e);
    assertTrue(market.isOpenForHedging(e));
    assertEq(market.probYesBps(e), 8500);
    assertEq(vault.earmarked(), 30_000e6);
    assertFalse(_needed()); // a live round: nothing to do
  }

  function test_nothingToDoReverts() public {
    rounds.performUpkeep("");
    vm.expectRevert("Rounds: nothing to do");
    rounds.performUpkeep("");
  }

  /// A strike below spot must NOT resolve early (the touch-latch resolver would have, at once).
  function test_doesNotResolveBeforeExpiry() public {
    rounds.performUpkeep("");
    vm.warp(block.timestamp + 23 hours);
    feed.setAnswer(2600e8);
    assertFalse(_needed());
  }

  function test_expiryAboveStrikeResolvesYesAndRolls() public {
    rounds.performUpkeep("");
    (bytes32 first,,) = rounds.rounds(1);
    vm.warp(block.timestamp + 1 days + 1);
    feed.setAnswer(2450e8); // down 2%: still above the strike
    assertTrue(_needed());
    vm.prank(address(0xC1A1)); // anyone, e.g. the Automation forwarder
    rounds.performUpkeep("");

    (bool done, bool yes) = market.isResolved(first);
    assertTrue(done);
    assertTrue(yes);
    (bytes32 second, int256 strike,) = rounds.rounds(2);
    assertEq(rounds.roundNumber(), 2);
    assertEq(strike, 2450e8 * 95 / 100); // new round, new strike off the new price
    assertEq(protected.eventId(), second);
    assertTrue(market.isOpenForHedging(second));
  }

  function test_crashResolvesNo() public {
    rounds.performUpkeep("");
    (bytes32 first,,) = rounds.rounds(1);
    vm.warp(block.timestamp + 1 days + 1);
    feed.setAnswer(2200e8); // down 12%: below the strike → NO, the long's protection pays
    rounds.performUpkeep("");
    (bool done, bool yes) = market.isResolved(first);
    assertTrue(done);
    assertFalse(yes);
  }

  function test_staleFeedWaits() public {
    rounds.performUpkeep("");
    vm.warp(block.timestamp + 1 days + 4 hours); // feed not updated for over 3 hours
    assertFalse(_needed());
    feed.setAnswer(2500e8);
    assertTrue(_needed());
  }

  function test_thirdRoundFreesTheFirstRoundsCapacity() public {
    rounds.performUpkeep("");
    uint256 t = 1_760_000_000; // explicit times: with via-ir, block.timestamp can be cached across warps
    for (uint256 i = 0; i < 2; i++) {
      t += 1 days + 1;
      vm.warp(t);
      feed.setAnswer(2500e8);
      rounds.performUpkeep("");
    }
    assertEq(rounds.roundNumber(), 3);
    assertEq(vault.earmarked(), 60_000e6); // rounds 2 and 3; round 1 was released
  }

  function test_onlyOwnerSetsParams() public {
    rounds.setParams(1000, 10 minutes, 5_000e6, 70, 30);
    rounds.performUpkeep("");
    (, int256 strike, uint64 deadline) = rounds.rounds(1);
    assertEq(strike, 2250e8);
    assertEq(deadline, block.timestamp + 10 minutes);
    vm.prank(address(0xBAD));
    vm.expectRevert("Rounds: not owner");
    rounds.setParams(500, 1 days, 1, 1, 1);
  }

  function test_adminCallsAreClosedToOthers() public {
    vm.expectRevert("Market: not owner");
    market.createMarket(bytes32(uint256(1)), address(resolver), uint64(block.timestamp + 1), 1, 1);
    vm.expectRevert("Protected: not owner");
    protected.setEvent(bytes32(uint256(1)));
  }
}
