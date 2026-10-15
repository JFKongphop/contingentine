// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockAqua} from "../src/mocks/MockAqua.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";
import {AquaReserve} from "../src/AquaReserve.sol";

/// Makers back payouts from their own wallets through Aqua; the router draws on them to refill the vault.
contract AquaReserveTest is Test {
  MockUSDG usdg;
  MockAqua aqua;
  UnderwriterVault vault;
  SettlementRouter router;
  AquaReserve reserve;

  address alice = address(0xA11CE);
  address bob = address(0xB0B);

  function setUp() public {
    usdg = new MockUSDG();
    aqua = new MockAqua();
    vault = new UnderwriterVault(address(usdg));
    router = new SettlementRouter(address(vault));
    vault.authorise(address(router), true);
    reserve = new AquaReserve(address(aqua), address(usdg), address(router));
    router.configureRouting(address(0), address(reserve), address(0));
    router.authorise(address(this), true);

    _ship(alice, 1, 1_000e6, 1_000e6);
    _ship(bob, 1, 500e6, 500e6);
  }

  function _ship(address maker, uint256 nonce, uint256 wallet, uint256 shipped) internal {
    usdg.mint(maker, wallet);
    address[] memory tokens = new address[](1);
    tokens[0] = address(usdg);
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = shipped;
    vm.startPrank(maker);
    usdg.approve(address(aqua), type(uint256).max);
    aqua.ship(address(reserve), reserve.strategyFor(maker, nonce), tokens, amounts);
    vm.stopPrank();
    reserve.register(maker, nonce);
  }

  function test_fundsStayInMakersWalletsUntilDrawn() public view {
    assertEq(usdg.balanceOf(alice), 1_000e6);
    assertEq(usdg.balanceOf(address(reserve)), 0);
    assertEq(reserve.available(), 1_500e6);
    assertEq(reserve.lineCount(), 2);
  }

  function test_routerDrawsFromMakersIntoTheVault() public {
    uint256 funded = router.topUpFromAqua(1_200e6);
    assertEq(funded, 1_200e6);
    assertEq(vault.totalReserve(), 1_200e6);
    assertEq(usdg.balanceOf(alice), 0); // first line used in full
    assertEq(usdg.balanceOf(bob), 300e6); // second line covers the rest
    assertEq(reserve.contributed(alice), 1_000e6);
    assertEq(reserve.contributed(bob), 200e6);
    assertEq(reserve.available(), 300e6);
  }

  function test_shortfallReverts() public {
    vm.expectRevert("Router: aqua short");
    router.topUpFromAqua(2_000e6);
  }

  function test_onlyRouterCanDraw() public {
    vm.expectRevert("AquaReserve: not router");
    reserve.provideUSDG(address(this), 1e6);
  }

  function test_makerCanLeaveByDocking() public {
    address[] memory tokens = new address[](1);
    tokens[0] = address(usdg);
    bytes32 h = keccak256(reserve.strategyFor(alice, 1));
    vm.prank(alice);
    aqua.dock(address(reserve), h, tokens);
    assertEq(reserve.available(), 500e6);
    router.topUpFromAqua(500e6);
    assertEq(usdg.balanceOf(alice), 1_000e6); // untouched
  }

  function test_spentWalletCountsForLess() public {
    vm.prank(alice);
    usdg.transfer(address(0xDEAD), 900e6);
    assertEq(reserve.available(), 600e6); // 100 left in Alice's wallet + Bob's 500
  }

  function test_registerNeedsARealShipment() public {
    vm.expectRevert("AquaReserve: nothing shipped");
    reserve.register(address(0xC0FFEE), 1);
    vm.expectRevert("AquaReserve: registered");
    reserve.register(alice, 1);
  }
}
