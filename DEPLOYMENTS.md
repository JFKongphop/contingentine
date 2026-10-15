# Contingent — Live Deployment

**Network:** Arbitrum Sepolia (chain **421614**) · **Deployed:** 2026-09-23
**Deployer:** `0x204a73e8303F3d09B12062dEdAA74B1CDA6E167d`
**Status:** ✅ live · **all 14 contracts source-verified on Arbiscan** · event market seeded (100,000 USDG capacity) · **ETH-PERP house pool seeded (100,000 USDG)**, priced by real Chainlink ETH/USD · live CoFHE FHE ops verified on-chain.

## Contract addresses

| Contract | Address | Arbiscan |
|---|---|---|
| **ContingentHedge** (orchestrator) | `0x670b2dC8EEa68Cb6BA2caC4021FCE02b85C51Dcf` | [↗](https://sepolia.arbiscan.io/address/0x670b2dC8EEa68Cb6BA2caC4021FCE02b85C51Dcf) |
| **ConfidentialUSDG** (cUSDG) | `0xd8f57E64bc235D4bceF8D2f791BDf46908408F94` | [↗](https://sepolia.arbiscan.io/address/0xd8f57E64bc235D4bceF8D2f791BDf46908408F94) |
| **ConfidentialCollateral** | `0x4E4cb1b3B326C79FDFD51E14C26C9bDA7a5F5898` | [↗](https://sepolia.arbiscan.io/address/0x4E4cb1b3B326C79FDFD51E14C26C9bDA7a5F5898) |
| **ConfidentialPositionManager** | `0xA39438870296a652A268B7A187C5a540bf89cD36` | [↗](https://sepolia.arbiscan.io/address/0xA39438870296a652A268B7A187C5a540bf89cD36) |
| **EventMarket** (public odds) | `0xD81751083861194276BC401Fc94052De0ea3A97a` | [↗](https://sepolia.arbiscan.io/address/0xD81751083861194276BC401Fc94052De0ea3A97a) |
| **UnderwriterVault** (LP counterparty) | `0xB73fF66E6768eC894BaF56E48e93dBBaAD745DCf` | [↗](https://sepolia.arbiscan.io/address/0xB73fF66E6768eC894BaF56E48e93dBBaAD745DCf) |
| **SettlementRouter** (1inch) | `0xF0573896166052659A90Fa3626A0ff36637353CF` | [↗](https://sepolia.arbiscan.io/address/0xF0573896166052659A90Fa3626A0ff36637353CF) |
| **PositionNFT** | `0xA526FADAA46544da9b54EC97Ab7e1B80DE00a542` | [↗](https://sepolia.arbiscan.io/address/0xA526FADAA46544da9b54EC97Ab7e1B80DE00a542) |
| **PriceThresholdResolver** (Chainlink) | `0xd4fa6b3b391Cc75eED61427F08051E219cB46cc4` | [↗](https://sepolia.arbiscan.io/address/0xd4fa6b3b391Cc75eED61427F08051E219cB46cc4) |
| **EventHook** (Uniswap v4) | `0xc809EecCc81148B72bFCEB6F812e0deEA982C8C0` | [↗](https://sepolia.arbiscan.io/address/0xc809EecCc81148B72bFCEB6F812e0deEA982C8C0) |
| **ConfidentialPerp** (ETH-PERP, 1–10x) | `0x8547089cE2380ec20Ad68c5fff4E661863452718` | [↗](https://sepolia.arbiscan.io/address/0x8547089cE2380ec20Ad68c5fff4E661863452718) |
| **ProtectedPerp** (perp + event protection, one tx) | `0xf97AA238bA1e462c05863eFa9cc4E13d240Ffb2c` | [↗](https://sepolia.arbiscan.io/address/0xf97AA238bA1e462c05863eFa9cc4E13d240Ffb2c) |
| **ShieldedGateway** (zero-knowledge entry / exit) | `0x23fD444b2e5a6b72d788FEcb62161990b63e6E74` | [↗](https://sepolia.arbiscan.io/address/0x23fD444b2e5a6b72d788FEcb62161990b63e6E74) |
| **NoteVerifier** (Groth16 verifier for the gateway) | `0x526d4d472637C38e6D534b1884432ee5952d0e9E` | [↗](https://sepolia.arbiscan.io/address/0x526d4d472637C38e6D534b1884432ee5952d0e9E) |
| MockUSDG (test collateral) | `0x766f287682ecfbD8f97551727684c7d7aD67a53f` | [↗](https://sepolia.arbiscan.io/address/0x766f287682ecfbD8f97551727684c7d7aD67a53f) |
| MockAggregatorV3 (test feed) | `0x39247B800E58c6b8cd984dfe1605450Aa03F3B34` | [↗](https://sepolia.arbiscan.io/address/0x39247B800E58c6b8cd984dfe1605450Aa03F3B34) |

**External:** Uniswap v4 PoolManager `0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317` · CoFHE TaskManager `0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9`

> **2026-09-25 — ContingentHedge redeployed (security fix).** The original orchestrator
> `0x71Eb2B20e2666EbB510EbE4e7EEBE6D1125EB39C` granted full cover even when the encrypted premium lock was
> clamped by insufficient collateral (free protection). The new `openHedge` locks the premium **first**, scales
> cover to what was actually paid (`affordable = locked ÷ price`), clamps to vault capacity, and refunds any excess.
> The old contract is de-authorised on cUSDG, collateral, position manager, vault, NFT and router
> (`script/RedeployHedge.s.sol`); the tests are `test_shortCollateral_scalesCoverDown` and `test_noCollateral_noFreeCover`.

> **2026-10-11 — Shielded Gateway (ZK).** Deposit a fixed note (100 or 1,000 USDG) from one wallet; any wallet
> holding the note proves ownership with a Groth16 proof and receives confidential USDG (enter) or plain USDG
> (withdraw) at a fresh address. No existing contract changed. First live run: deposits
> `0x197773928e7ff85b2127161b91e54fe5fd46408cbcd3fd429eb120b2b7ef8d4e`, `0x85b51481f798b8da89ecf597dbb657df62a29214a3891979d7f5b5cf08bb4db8`;
> enter `0x09aa4bd94d1f4b269532f7c1093f86ff30c2a2cbc7420f7825ea107f290662d8`; withdraw
> `0xf171549d33ec0cb5c033b77c744fba398f5841efcfafea1c360754cdcff8d627`. Script: `script/DeployGateway.s.sol`;
> tests: `test/ShieldedGateway.t.sol`; circuit: `zk/note.circom`.
>
> **2026-09-25 — One-button protected perps.** `ProtectedPerp` opens an encrypted perp **and** its protection
> hedge on the "ETH ≥ $2,500" event in **one transaction**. The hedge side is `FHE.not(isLong)` on the ciphertext
> (long → NO, short → YES), so the trader's direction stays hidden, and the perp ↔ hedge link is stored on-chain
> (`protectionOf(perpId)`). `ConfidentialPerp` and `ContingentHedge` were redeployed with authorised
> `openPositionFor` / `openHedgeFor` entry points; the previous perp (`0x736C…E730`) and hedge (`0xc68d…D0df`)
> are de-authorised. Script: `script/DeployProtected.s.sol`; tests: `test/ProtectedPerp.t.sol`.

## Sample market (live)

- **Event:** "USDC depeg < $0.97" — `eventId = 0x610fbf40454f43083687931fa7640c421bda8701d7811d2e27ff584e761e79f7`
- **Odds:** `probYesBps = 500` (5% implied) · **open for hedging:** `true`
- **Underwriting:** vault `totalReserve = 100,000 USDG`, `earmarked = 100,000` (fully backing the event)

## Proof the live FHE flow works

The `earmark` tx (`0x8234f562fe9b2024807ffd6d3f2b4e02f7678e684c278eda5db022cf9d2c7f3a`) emitted **three `trivialEncrypt`
events** from the CoFHE TaskManager — the encrypted accumulators (`committedYes`, `committedNo`, `premiumPool`)
were initialised on live CoFHE. Confidential math runs on-chain on Arbitrum Sepolia, not just in the mock.

## Deploy note (gas)

FHE operations cost far more gas than `forge script` estimates from its simulation (e.g. `earmark` needs
~294k, forge estimated ~31k → out-of-gas). For any FHE-touching script tx, pass
`--gas-estimate-multiplier 300` (or a high explicit `--gas-limit`). Real user wallets estimate correctly via
`eth_estimateGas`, so `openHedge`/settlement work normally for users.

## Reproduce

```bash
cd contingent
./script/deploy-arb-sepolia.sh --broadcast          # core stack + seeded market (mocks for USDG/feed)
POOL_MANAGER=0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317 \
  EVENT_MARKET=<market addr> forge script script/DeployHook.s.sol:DeployHook \
  --rpc-url "$ARB_RPC" --private-key "$PRIVATE_KEY" --broadcast --gas-estimate-multiplier 200
```


---

# Ethereum Sepolia (chain 11155111) · deployed 2026-10-15

The full stack in one run (`script/DeploySepolia.s.sol`, 50 transactions, all successful), then `CRERoundKeeper`
with `forge create` (constructor: the RoundManager and Chainlink's Sepolia test forwarder
`0x15fC6ae953E024d975e77382eEeC56A9101f9F88`). All 21 contracts are source-verified on Etherscan. Ethereum Sepolia is the one testnet where Fhenix CoFHE,
Chainlink, Uniswap v4 and 1inch Aqua are all live. The frontend uses this deployment by default
(build with `NEXT_PUBLIC_CHAIN=arbitrum` for the original Arbitrum Sepolia one). Explorer: `https://sepolia.etherscan.io/address/<address>`.

| Contract | Address |
|---|---|
| MockUSDG | `0xBad4bD3148f18495D748D326bce53d4DD3473DD9` |
| ConfidentialUSDG | `0x2d01A8692D9842fa8C924E52b445bf07d0E446e3` |
| ConfidentialCollateral | `0xe6351fD6Eceb0e70E3Be6af1f85C3df50B20fb02` |
| ConfidentialPositionManager | `0x00aEcbf705C9B9A23eccF919d547F112875c73f6` |
| EventMarket | `0xa3439c99E010D1882F8865b5380fA65aAFA88700` |
| UnderwriterVault | `0xEE89B955F097C90e995b274a105fA837F167070D` |
| SettlementRouter | `0x90E73FA3F917dAd79fA98DcABc5fF7126845328A` |
| PositionNFT | `0xF1d04F92EF261864886C6dD31Fc96e2bf3958a32` |
| PriceThresholdResolver | `0xEA088FA50e9F9A13394e6395A806925ea74DEaC2` |
| ContingentHedge | `0xa2a98142d0203106798016E4D3e4d5d46cC4A6C8` |
| ConfidentialPerp | `0x5b8D077F3b10AD1338C1e8A983CC82CC9Aa385e7` |
| ProtectedPerp | `0x79B4B74B5bCf1bBC6932fEE31dd199F3469B0c31` |
| **RoundManager** (opens and resolves rounds) | `0x9D6520b5334ef79e66f6fcE2aE54911acAb693ed` |
| **CRERoundKeeper** (receives Chainlink CRE reports) | `0xc2282A61418c64613b734eb362E66B4396CF0D9c` |
| **ShieldedGateway** (zero-knowledge entry / exit) | `0x98c8eCaD5EbB6B6Db18cF164713593fdd2B93521` |
| NoteVerifier | `0x75A3b30acb277c8aFc6f0ba8567b505EC9302569` |
| **EventHook** (Uniswap v4 hook) | `0x84dC66Ce19d5B2e51337B5C2C92bf021db2D08c0` |
| OddsToken YES / NO | `0x72eB5870a166B86Cf290489F356e880A87545E1c` / `0xC55038bF5736C5D2602e20B01B4EB8B89F501cCc` |
| OddsRouter | `0xd2f4Ceda99d175Cb9375F17e15588A758E7055d1` |
| **AquaReserve** (1inch Aqua app) | `0x73d0aA485D4add3A7A6fb9c9Cb3C46B1c20F8774` |
| Chainlink ETH/USD feed | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| Uniswap v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| 1inch Aqua | `0x499943E74FB0cE105688beeE8Ef2ABec5D936d31` |

## What runs there, with the transactions that prove it

The transactions below were made on the previous Sepolia deployment (11 Oct 2026, same code and script),
whose addresses this one replaces. Round 1 of this deployment opened at deploy time at 85% YES odds.

- **Rounds run themselves.** `RoundManager` owns EventMarket, the resolver and ProtectedPerp. `performUpkeep` resolves
  an expired round from the Chainlink feed and opens the next, with the strike 5% under the price at that moment.
  Round 1 opened at deploy (strike $2,239.74, one day, ends 16 Oct 2026 05:47 UTC). Chainlink retired Automation in favour of the Chainlink Runtime Environment (CRE), so the
  schedule is a CRE workflow (`cre/round-keeper`): every five minutes it reads `checkUpkeep`, and when a round is
  due it sends a signed report to `CRERoundKeeper`, which calls `performUpkeep`. The workflow is **not deployed to
  a Chainlink DON yet** (that needs deploy access); until then anyone can call `performUpkeep`, and the SETTLE tab
  has a button for it.
  Proven on 12 Oct 2026 from Chainlink's simulator, with real transactions through the test forwarder:
  round 1 → 2 in `0x2679775426f39936cf742d3819cc2ac3d6613248f3cbc7860f500c4d9827e531`, round 2 → 3 in
  `0x1c55588dd6b994c95e5b81319a32fe9db4174390d104930b9d3108e597322e03`.
- **Payouts settle.** After round 2 resolved YES, hedge #2 (YES, 200 USDG, encrypted) was settled: Fhenix decrypted
  the payout, the contract verified it and the vault paid 200 USDG to the owner. Hedge #1 (the losing side of
  round 1) settled at 0. Script: `frontend/scripts/sepolia-settle.mjs`.
- **The odds are a Uniswap v4 pool.** YES/NO tokens trade in a pool guarded by `EventHook`; `EventMarket.probYesBps`
  returns that pool's price, so hedges are priced off Uniswap. Live check: the pool read 85.00%; selling YES
  (`0x624c34568cc5983c1b82158f3ce871c93cd1c713aaa289f8aa48ce4e5bdee08b`) moved it to 0.24%; buying YES back
  (`0x195b7122111e51e827d9cd836537c426b705419f1b2ccb0ba488a47f64e4cb5f`) returned it to 85.12%. The odds tokens are
  free to mint on testnet and not redeemable yet.
- **1inch Aqua backs payouts from makers' wallets.** A maker shipped 5,000 USDG of virtual balance to `AquaReserve`
  on the real Aqua (`0x0de7639fea466f86d7b8ca18f284f531fcaeb4b4cbc9418ff1efbc414f8aed00`); the USDG stayed in the
  wallet. `SettlementRouter.topUpFromAqua(2,000)` (`0x9e1e10ee18ef0f4601c355ad3cf53f69933756083eeb7380822a3d4e308347ec`)
  then pulled 2,000 USDG from that wallet into the vault: reserve 100,000 → 102,000. Makers are not paid for this yet.
- **Zero-knowledge gateway.** Two 1,000 USDG deposits (`0xf8e9105a6ce8c6903347957918b0a7cdd8edff66a75a63b5772c7ec2103aaadd`,
  `0xd18a7c1b649f3e0ee3fad31e96a0899977fbcbdc9a8572081270458eee833b33`); private entry to a fresh address as
  confidential USDG (`0x268859531b77e574f8868ea0a7be8d1170311dec759cd8d5f8889fcc8dafa8e2`); private withdrawal to
  another (`0x71622ea337c1aa208b4bc96ff32be1628caf0967fa30538b3ca37b2c77c20437`).

## Notes

- **Gas.** Sepolia prices new storage far above what Foundry simulates locally (a 1.7 KB contract needs about 3M
  gas). Deploy with `--gas-estimate-multiplier 800`.
- **Not tested here yet:** opening a protected perp from the browser (it needs the Fhenix client-side encryption),
  and a round rolling over after a real expiry.
- The 11 Oct 2026 Sepolia deployments (an early run without the hook and Aqua, then the full stack) are
  superseded by the addresses above.
