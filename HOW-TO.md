# Contingent — How to Use

Privately hedge a real-world event — priced by a prediction market, encrypted with Fhenix CoFHE,
settled in USDG on **Arbitrum Sepolia**. Live demo event: **"ETH ≥ $2,500"** (resolved by real Chainlink).

> One-liner: **MARKET** shows the price → **HEDGE** opens an encrypted position on it → **SETTLE**
> resolves via Chainlink and pays you in USDG. *v4 prices it · Fhenix hides it · 1inch settles it.*

---

## 0. Setup (one-time)

| Need | How |
|---|---|
| **Run it** | `cd contingent/frontend && npm install && npm run dev` → open http://localhost:3000 |
| **Wallet** | MetaMask (or any injected wallet) |
| **Network** | Arbitrum Sepolia — the **Connect Wallet** button offers to add/switch it |
| **Gas** | A little Arb Sepolia ETH — e.g. https://faucet.quicknode.com/arbitrum/sepolia |
| **USDG** | None needed — the app **mints its own test USDG** for you |

No wallet? You can still browse — the MARKET stats, ETH chart, and odds load read-only.

---

## 1. The 2-minute demo flow

**Landing (`/`)** → click **LAUNCH APP →**, then **Connect Wallet** (top-right).

### ① MARKET — the public prediction market
- Live **ETH/USD candlesticks** (Chainlink) with the **$2,500 strike line** drawn on it.
- Implied odds (~65%) + the YES/NO pool bar.
- *(Optional)* hit **STAKE YES / STAKE NO** to move the odds live.

### ② HEDGE — open your confidential derivative
1. **Prepare collateral** (one-time): **MINT + WRAP** USDG → cUSDG (e.g. `500`), then **DEPOSIT** encrypted collateral (e.g. `200`).
2. Choose **direction** (YES = ETH ≥ $2,500) and **notional** (e.g. `400`).
3. Watch the **premium** (`size · p / 10000`) and the **payoff diagram** update live.
4. **🔒 OPEN ENCRYPTED HEDGE** — encrypts your size + side via Fhenix; the tx hides them on-chain.
5. Your position appears under **Your hedges** ("size & side encrypted").

### ③ SETTLE — resolve and get paid
1. **1 · RESOLVE EVENT** — reads real Chainlink; ETH ≥ $2,500 → **YES**.
2. **2 · SETTLE POSITION** (enter your position id) — runs the 3-step async decrypt → pays the winner in USDG.
3. **3 · SWEEP PREMIUMS → LPs** and **4 · FINALISE EVENT**.

### ④ UNDERWRITE — the LP side (optional)
- **DEPOSIT** USDG to back payouts, **EARMARK** capacity, watch the reserve book + your P&L
  (`P&L = premiums − payouts`).

---

## 2. Tab reference

| Tab | Role | You can |
|---|---|---|
| **MARKET** | Public prediction market | See the ETH chart + strike, implied odds; stake to move them |
| **HEDGE** | The confidential derivative | Fund → deposit encrypted collateral → open a private hedge |
| **UNDERWRITE** | LP / counterparty | Deposit USDG, earmark capacity, earn the premium spread |
| **SETTLE** | Keeper | Resolve, async-decrypt settle, sweep premiums, finalise |

---

## 3. What's happening under the hood

- **The derivative** = a binary option on the event: pay premium `p·N`, receive notional `N` if you win.
- **Pricing** = the prediction market's implied probability `p` (no option-pricing model needed).
- **Privacy** = your size + direction are `euint` ciphertexts (Fhenix CoFHE); the premium is computed on
  the ciphertext, and only the winning payout is decrypted, once, at settlement.
- **Solvency** = LP capital in the `UnderwriterVault`, bounded per-event by an encrypted capacity clamp.
- **Settlement** = winners paid from the vault in USDG, routed via 1inch.

Public odds (Uniswap v4 layer) · private positions (Fhenix) · USDG settlement (1inch). FHE never flows
through a swap — v4 and 1inch only touch public or already-decrypted values.

---

## 4. Live deployment

Everything runs on **Arbitrum Sepolia (chain 421614)**, all contracts **source-verified on Arbiscan**.
Addresses + tx hashes: [`DEPLOYMENTS.md`](./DEPLOYMENTS.md). Design + mechanics:
[`contingent-protocol.md`](./contingent-protocol.md) · [`hedging-explained.md`](./hedging-explained.md).

> Testnet demo — mock USDG, no real funds.
