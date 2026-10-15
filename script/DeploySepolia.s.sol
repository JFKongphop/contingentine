// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
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
import {ShieldedGateway} from "../src/ShieldedGateway.sol";
import {NoteVerifier} from "../src/zk/NoteVerifier.sol";
import {EventHook} from "../src/EventHook.sol";
import {OddsToken} from "../src/OddsToken.sol";
import {OddsRouter} from "../src/OddsRouter.sol";
import {AquaReserve} from "../src/AquaReserve.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

/// @title DeploySepolia - the whole of Contingent on Ethereum Sepolia (chain 11155111), in one run
/// @notice Core protocol + perps + one-transaction protection + the zero-knowledge gateway + the RoundManager
///         that Chainlink Automation drives + the odds pool on Uniswap v4 (EventHook) + the 1inch Aqua
///         payout backstop. Ends with round 1 open and the odds pool funded, so the app is usable straight away.
///         Ethereum Sepolia is the one testnet with Fhenix CoFHE, Chainlink, Uniswap v4 and 1inch all live.
///   forge script script/DeploySepolia.s.sol --rpc-url $SEPOLIA_RPC --private-key $PRIVATE_KEY --broadcast
contract DeploySepolia is Script {
  address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // Chainlink ETH/USD, 8 decimals
  address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543; // Uniswap v4
  address constant AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31; // 1inch Aqua

  MockUSDG usdg;
  ConfidentialUSDG cusdg;
  ConfidentialCollateral collateral;
  ConfidentialPositionManager pm;
  EventMarket market;
  UnderwriterVault vault;
  SettlementRouter router;
  PositionNFT nft;
  PriceThresholdResolver resolver;
  ContingentHedge hedge;
  ConfidentialPerp perp;
  ProtectedPerp protected;
  RoundManager rounds;
  NoteVerifier verifier;
  ShieldedGateway gateway;
  EventHook hook;
  OddsToken yes;
  OddsToken no;
  OddsRouter oddsRouter;
  AquaReserve aquaReserve;

  function run() external {
    uint256 seed = vm.envOr("SEED", uint256(100_000e6));
    vm.startBroadcast();
    _core();
    _wire();
    _seed(seed);
    _roundsAndGateway();
    _oddsPool();
    _aqua();
    vm.stopBroadcast();
    _log();
  }

  function _core() internal {
    usdg = new MockUSDG();
    cusdg = new ConfidentialUSDG(address(usdg));
    collateral = new ConfidentialCollateral(address(cusdg));
    pm = new ConfidentialPositionManager();
    market = new EventMarket();
    vault = new UnderwriterVault(address(usdg));
    router = new SettlementRouter(address(vault));
    nft = new PositionNFT();
    resolver = new PriceThresholdResolver();
    hedge = new ContingentHedge(
      address(market), address(collateral), address(pm), address(cusdg), address(vault), address(nft), address(router)
    );
    perp = new ConfidentialPerp(address(usdg), address(cusdg), address(collateral), ETH_USD_FEED);
    protected = new ProtectedPerp(address(perp), address(hedge), bytes32(0)); // the RoundManager sets the event
  }

  function _wire() internal {
    cusdg.authorise(address(hedge), true);
    collateral.authorise(address(hedge), true);
    pm.authorise(address(hedge), true);
    vault.authorise(address(hedge), true);
    vault.authorise(address(router), true);
    router.authorise(address(hedge), true);
    nft.authorise(address(hedge), true);
    cusdg.authorise(address(perp), true);
    collateral.authorise(address(perp), true);
    perp.authorise(address(protected), true);
    hedge.authorise(address(protected), true);
  }

  function _seed(uint256 seed) internal {
    usdg.mint(msg.sender, 2 * seed);
    usdg.approve(address(vault), seed);
    vault.deposit(seed); // LP reserve that underwrites protection
    usdg.approve(address(perp), seed);
    perp.deposit(seed); // house pool for the perps
  }

  function _roundsAndGateway() internal {
    rounds = new RoundManager(
      ETH_USD_FEED, address(market), address(resolver), address(vault), address(hedge), address(protected)
    );
    // the odds come from the Uniswap v4 pool behind the hook (set before ownership moves to the RoundManager)
    bytes memory args = abi.encode(IPoolManager(POOL_MANAGER), address(market), msg.sender);
    uint160 flags = uint160(Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
    (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(EventHook).creationCode, args);
    hook = new EventHook{salt: salt}(IPoolManager(POOL_MANAGER), address(market), msg.sender);
    require(address(hook) == hookAddr, "hook address mismatch");
    market.setOddsSource(address(hook));

    market.transferOwnership(address(rounds));
    resolver.transferOwnership(address(rounds));
    protected.transferOwnership(address(rounds));
    vault.authorise(address(rounds), true);
    rounds.performUpkeep(""); // open round 1

    uint256[] memory amounts = new uint256[](2);
    amounts[0] = 100e6;
    amounts[1] = 1000e6;
    verifier = new NoteVerifier();
    gateway = new ShieldedGateway(address(usdg), address(cusdg), address(verifier), amounts);
  }

  /// A YES/NO pool on Uniswap v4, opened at 85% and funded across the full range. Round 1 must be live:
  /// the hook refuses liquidity while no round is open.
  function _oddsPool() internal {
    yes = new OddsToken("Contingent YES", "cYES");
    no = new OddsToken("Contingent NO", "cNO");
    oddsRouter = new OddsRouter(IPoolManager(POOL_MANAGER));
    bool yes0 = address(yes) < address(no);
    PoolKey memory key = PoolKey({
      currency0: Currency.wrap(yes0 ? address(yes) : address(no)),
      currency1: Currency.wrap(yes0 ? address(no) : address(yes)),
      fee: 3000,
      tickSpacing: 60,
      hooks: IHooks(address(hook))
    });
    IPoolManager(POOL_MANAGER).initialize(key, oddsRouter.sqrtPriceForProb(8500, yes0));
    hook.bindRollingPool(key, address(rounds), yes0);
    yes.mint(msg.sender, 1e24);
    no.mint(msg.sender, 1e24);
    yes.approve(address(oddsRouter), type(uint256).max);
    no.approve(address(oddsRouter), type(uint256).max);
    oddsRouter.addLiquidity(key, TickMath.minUsableTick(60), TickMath.maxUsableTick(60), 1e21);
  }

  /// Makers can back payouts from their own wallets through 1inch Aqua; the router draws on them.
  function _aqua() internal {
    aquaReserve = new AquaReserve(AQUA, address(usdg), address(router));
    router.configureRouting(address(0), address(aquaReserve), address(0));
  }

  function _log() internal view {
    console.log("usdg", address(usdg));
    console.log("cusdg", address(cusdg));
    console.log("collateral", address(collateral));
    console.log("positions", address(pm));
    console.log("market", address(market));
    console.log("vault", address(vault));
    console.log("router", address(router));
    console.log("positionNFT", address(nft));
    console.log("resolver", address(resolver));
    console.log("hedge", address(hedge));
    console.log("perp", address(perp));
    console.log("protectedPerp", address(protected));
    console.log("roundManager", address(rounds));
    console.log("noteVerifier", address(verifier));
    console.log("gateway", address(gateway));
    console.log("eventHook", address(hook));
    console.log("oddsYes", address(yes));
    console.log("oddsNo", address(no));
    console.log("oddsRouter", address(oddsRouter));
    console.log("aquaReserve", address(aquaReserve));
    console.log("feed", ETH_USD_FEED);
  }
}
