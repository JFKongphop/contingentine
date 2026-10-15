// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {EventMarket} from "../src/EventMarket.sol";
import {EventHook} from "../src/EventHook.sol";
import {OddsToken} from "../src/OddsToken.sol";
import {OddsRouter} from "../src/OddsRouter.sol";
import {ManualResolver} from "../src/resolvers/ManualResolver.sol";

/// @dev Stands in for the RoundManager: says which round is live.
contract Rounds {
  bytes32 public currentEvent;

  function set(bytes32 e) external {
    currentEvent = e;
  }
}

/// Real Uniswap v4: a YES/NO pool with the EventHook is the odds source for the EventMarket.
contract OddsPoolTest is Test {
  PoolManager manager;
  EventHook hook;
  EventMarket market;
  ManualResolver resolver;
  OddsRouter router;
  OddsToken yes;
  OddsToken no;
  Rounds rounds;
  PoolKey key;
  bool yes0;

  address attestor = address(0xA77E);
  bytes32 constant ROUND_1 = keccak256("round 1");
  bytes32 constant ROUND_2 = keccak256("round 2");

  function setUp() public {
    manager = new PoolManager(address(this));
    router = new OddsRouter(IPoolManager(address(manager)));
    market = new EventMarket();
    resolver = new ManualResolver(attestor);
    rounds = new Rounds();

    address hookAddr = address(uint160(Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG));
    deployCodeTo("EventHook.sol:EventHook", abi.encode(manager, address(market), address(this)), hookAddr);
    hook = EventHook(hookAddr);

    yes = new OddsToken("Contingent YES", "cYES");
    no = new OddsToken("Contingent NO", "cNO");
    yes0 = address(yes) < address(no);
    (address c0, address c1) = yes0 ? (address(yes), address(no)) : (address(no), address(yes));
    key = PoolKey({currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: 3000, tickSpacing: 60, hooks: IHooks(hookAddr)});

    // round 1 is live; the built-in pools say 50%, the v4 pool will say 85%
    market.createMarket(ROUND_1, address(resolver), uint64(block.timestamp + 1 days), 50, 50);
    rounds.set(ROUND_1);
    manager.initialize(key, router.sqrtPriceForProb(8500, yes0));
    hook.bindRollingPool(key, address(rounds), yes0);
    market.setOddsSource(address(hook));

    yes.mint(address(this), 1e24);
    no.mint(address(this), 1e24);
    yes.approve(address(router), type(uint256).max);
    no.approve(address(router), type(uint256).max);
    router.addLiquidity(key, TickMath.minUsableTick(60), TickMath.maxUsableTick(60), 1e21);
  }

  function test_marketReadsOddsFromThePool() public view {
    assertApproxEqAbs(market.probYesBps(ROUND_1), 8500, 2); // not the built-in 50%
  }

  function test_buyingYesRaisesTheProbability() public {
    uint256 before = market.probYesBps(ROUND_1);
    router.swapExactIn(key, !yes0, 50e18, 0); // pay NO, receive YES
    assertGt(market.probYesBps(ROUND_1), before);
  }

  function test_buyingNoLowersTheProbability() public {
    uint256 before = market.probYesBps(ROUND_1);
    uint256 out = router.swapExactIn(key, yes0, 50e18, 0); // pay YES, receive NO
    assertGt(out, 0);
    assertLt(market.probYesBps(ROUND_1), before);
  }

  function test_slippageLimit() public {
    vm.expectRevert("OddsRouter: slippage");
    router.swapExactIn(key, yes0, 1e18, 1e30);
  }

  function test_tradingFreezesAtResolutionAndReopensNextRound() public {
    vm.prank(attestor);
    resolver.report(ROUND_1, true);
    market.resolve(ROUND_1);
    vm.expectRevert(); // EventHook.MarketClosedForTrading, wrapped by the pool manager
    router.swapExactIn(key, yes0, 1e18, 0);
    assertEq(market.probYesBps(ROUND_1), 5000); // a resolved round falls back to its own pools

    market.createMarket(ROUND_2, address(resolver), uint64(block.timestamp + 1 days), 50, 50);
    rounds.set(ROUND_2);
    router.swapExactIn(key, yes0, 1e18, 0); // open again
    assertApproxEqAbs(market.probYesBps(ROUND_2), 8500, 60); // the pool carries its price into the new round
  }

  function test_onlyTheLiveRoundIsPricedByThePool() public {
    market.createMarket(ROUND_2, address(resolver), uint64(block.timestamp + 1 days), 30, 70);
    assertEq(market.probYesBps(ROUND_2), 3000); // not live → built-in pools
  }

  function test_rollingPoolBindsOnceAndOnlyByOwner() public {
    vm.expectRevert("EventHook: already bound");
    hook.bindRollingPool(key, address(rounds), yes0);
    vm.prank(address(0xBAD));
    vm.expectRevert("EventHook: not owner");
    hook.bindRollingPool(key, address(rounds), yes0);
  }
}
