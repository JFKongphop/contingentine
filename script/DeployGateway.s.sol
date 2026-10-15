// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ShieldedGateway} from "../src/ShieldedGateway.sol";
import {NoteVerifier} from "../src/zk/NoteVerifier.sol";

/// @notice Deploy the zero-knowledge entry/exit in front of the live protocol. Touches no existing contract:
///         the gateway only calls public functions of ConfidentialUSDG. Defaults are the Arbitrum Sepolia
///         deployment; override USDG / CUSDG for another chain.
///   forge script script/DeployGateway.s.sol --rpc-url $ARB_RPC --private-key $PRIVATE_KEY --broadcast
contract DeployGateway is Script {
  function run() external {
    address usdg = vm.envOr("USDG", 0x766f287682ecfbD8f97551727684c7d7aD67a53f);
    address cusdg = vm.envOr("CUSDG", 0xd8f57E64bc235D4bceF8D2f791BDf46908408F94);
    uint256[] memory amounts = new uint256[](2);
    amounts[0] = 100e6;
    amounts[1] = 1000e6;

    vm.startBroadcast();
    NoteVerifier verifier = new NoteVerifier();
    ShieldedGateway gateway = new ShieldedGateway(usdg, cusdg, address(verifier), amounts);
    vm.stopBroadcast();

    console.log("NoteVerifier    ", address(verifier));
    console.log("ShieldedGateway ", address(gateway));
    console.log("deploy block    ", block.number);
  }
}
