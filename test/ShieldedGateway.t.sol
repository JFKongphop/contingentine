// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CofheTest} from "@cofhe/foundry-plugin/contracts/CofheTest.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {ConfidentialUSDG} from "../src/ConfidentialUSDG.sol";
import {ShieldedGateway} from "../src/ShieldedGateway.sol";
import {NoteVerifier} from "../src/zk/NoteVerifier.sol";

/// Real Groth16 proofs, made by `zk/fixture.mjs` (three deposits; note 0 enters, note 2 withdraws).
contract ShieldedGatewayTest is CofheTest {
  MockUSDG usdg;
  ConfidentialUSDG cusdg;
  ShieldedGateway gateway;

  address depositor = address(0xA11CE);
  address constant FRESH = 0x000000000000000000000000000000000000bEEF; // bound in the "enter" proof
  address constant EXIT = 0x000000000000000000000000000000000000cafE; // bound in the "withdraw" proof
  uint256 constant AMOUNT = 1000e6;

  struct Proof {
    uint256[2] pA;
    uint256[2][2] pB;
    uint256[2] pC;
    bytes32 nullifierHash;
  }

  string json;
  bytes32 root;

  function setUp() public {
    deployMocks();
    usdg = new MockUSDG();
    cusdg = new ConfidentialUSDG(address(usdg));
    uint256[] memory amounts = new uint256[](2);
    amounts[0] = 100e6;
    amounts[1] = AMOUNT;
    gateway = new ShieldedGateway(address(usdg), address(cusdg), address(new NoteVerifier()), amounts);

    usdg.mint(depositor, 10_000e6);
    vm.prank(depositor);
    usdg.approve(address(gateway), type(uint256).max);

    json = vm.readFile("test/fixtures/note-proofs.json");
    root = vm.parseJsonBytes32(json, ".root");
  }

  function _load(string memory key) internal view returns (Proof memory p) {
    uint256[] memory a = vm.parseJsonUintArray(json, string.concat(key, ".pA"));
    uint256[] memory b0 = vm.parseJsonUintArray(json, string.concat(key, ".pB[0]"));
    uint256[] memory b1 = vm.parseJsonUintArray(json, string.concat(key, ".pB[1]"));
    uint256[] memory c = vm.parseJsonUintArray(json, string.concat(key, ".pC"));
    p.pA = [a[0], a[1]];
    p.pB = [[b0[0], b0[1]], [b1[0], b1[1]]];
    p.pC = [c[0], c[1]];
    p.nullifierHash = vm.parseJsonBytes32(json, string.concat(key, ".nullifierHash"));
  }

  function _depositAll() internal {
    bytes32[] memory inners = vm.parseJsonBytes32Array(json, ".inners");
    for (uint256 i = 0; i < inners.length; i++) {
      vm.prank(depositor);
      gateway.deposit(inners[i], AMOUNT);
    }
  }

  function _spend(Proof memory p, address recipient, uint8 action) internal {
    gateway.spend(p.pA, p.pB, p.pC, root, p.nullifierHash, AMOUNT, recipient, action);
  }

  /// The on-chain Poseidon tree and the circuit's tree must agree, or no proof would ever verify.
  function test_depositBuildsSameRootAsCircuit() public {
    _depositAll();
    assertEq(gateway.getLastRoot(), root);
    assertEq(usdg.balanceOf(address(gateway)), 3 * AMOUNT);
    assertEq(gateway.getLeaves().length, 3);
  }

  function test_enterCreditsFreshAddressWithConfidentialUSDG() public {
    _depositAll();
    vm.prank(address(0x7E1A7)); // a relayer: anyone can submit
    _spend(_load(".enter"), FRESH, 1);

    expectPlaintext(cusdg.confidentialBalanceOf(FRESH), uint64(AMOUNT));
    assertEq(usdg.balanceOf(address(cusdg)), AMOUNT);
    assertEq(usdg.balanceOf(address(gateway)), 2 * AMOUNT);
    assertTrue(gateway.spent(_load(".enter").nullifierHash));
  }

  function test_withdrawPaysPlainUSDGToFreshAddress() public {
    _depositAll();
    _spend(_load(".withdraw"), EXIT, 0);
    assertEq(usdg.balanceOf(EXIT), AMOUNT);
  }

  function test_cannotSpendTwice() public {
    _depositAll();
    Proof memory p = _load(".withdraw");
    _spend(p, EXIT, 0);
    vm.expectRevert("Gateway: note already spent");
    _spend(p, EXIT, 0);
  }

  function test_cannotRedirectToAnotherRecipient() public {
    _depositAll();
    Proof memory p = _load(".withdraw");
    vm.expectRevert("Gateway: invalid proof");
    _spend(p, address(0xBAD), 0);
  }

  function test_cannotChangeTheAction() public {
    _depositAll();
    Proof memory p = _load(".enter");
    vm.expectRevert("Gateway: invalid proof");
    _spend(p, FRESH, 0);
  }

  function test_cannotChangeTheAmount() public {
    _depositAll();
    Proof memory p = _load(".withdraw");
    vm.expectRevert("Gateway: invalid proof");
    gateway.spend(p.pA, p.pB, p.pC, root, p.nullifierHash, 100e6, EXIT, 0);
  }

  function test_unknownRootRejected() public {
    Proof memory p = _load(".withdraw"); // nothing deposited, so the fixture root was never on-chain
    vm.expectRevert("Gateway: unknown root");
    _spend(p, EXIT, 0);
  }

  function test_depositRules() public {
    bytes32[] memory inners = vm.parseJsonBytes32Array(json, ".inners");
    vm.startPrank(depositor);
    vm.expectRevert("Gateway: amount not allowed");
    gateway.deposit(inners[0], 250e6);
    gateway.deposit(inners[0], AMOUNT);
    vm.expectRevert("Gateway: note already deposited");
    gateway.deposit(inners[0], AMOUNT);
    vm.stopPrank();
  }

  /// A note paid for at 100 USDG cannot be spent as 1,000: the amount is hashed into the leaf on-chain.
  function test_smallDepositCannotSpendLarge() public {
    bytes32[] memory inners = vm.parseJsonBytes32Array(json, ".inners");
    vm.startPrank(depositor);
    gateway.deposit(inners[0], AMOUNT);
    gateway.deposit(inners[1], AMOUNT);
    gateway.deposit(inners[2], 100e6); // note 2 underpaid
    vm.stopPrank();
    Proof memory p = _load(".withdraw"); // proof for note 2 at 1,000
    vm.expectRevert("Gateway: unknown root");
    _spend(p, EXIT, 0);
  }
}
