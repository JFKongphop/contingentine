# Contingent — Click-by-Click Steps

Open **http://localhost:3000**. Keep DevTools Console open (⌥⌘J).

---

## 1. Start

1. Click **LAUNCH APP →**
2. Click **CONNECT WALLET** → approve in MetaMask
3. If asked, click **Switch network** → Arbitrum Sepolia

---

## 2. PERPS tab (opens by default)

**Right card — Prepare collateral** (one-time, shared with HEDGE)

1. Fund & wrap box → type **`1000`**
2. Click **MINT + WRAP** → confirm **3 times** in MetaMask → wait for **✓ Wrapped**
3. Deposit box → type **`600`** (covers perp 100 + protection 35 + hedge premium 260)
4. Click **DEPOSIT** → confirm → wait for **✓ Deposited**
   - Under **3 · Your encrypted collateral** click **👁 REVEAL** → **sign** once → you see **600** on the left, and only a ciphertext handle (`0x…`) on the right — that's all anyone else sees
   - If a red **⚠ Free collateral … < needed** line appears above the open button → deposit more

**Left card — Open a protected position (one button)**

5. Click **LONG ↑**
6. Collateral box → type **`100`**
7. Click **5x**
8. Check the **🛡 Protect with the event market** box is ticked (it is by default) → Cover box → type **`100`**
   - You'll see **Premium @ NO 35%** = 35 USDG and "Liquidated & ETH below strike: −100 alone → −35 protected"
9. Click **🛡 OPEN PROTECTED LONG 5x** → confirm **once** in MetaMask (no new signature if you already revealed)
10. Wait for **✓ Opened PROTECTED LONG 5x · perp #… + protection #… in one tx** (no ⚠ = nothing clamped)
11. Your position shows the badge **🛡 PROTECTED · NO 100 · #…**
12. Optional: untick the box to open a plain perp instead — then **🛡 PROTECT** on the row adds protection later
13. To close: click **CLOSE BOTH** → confirm **3 times** (request close, finish close, close protection) → **✓ Closed · paid … USDG · protection #… closed**

> Do steps 8–13 **before** Resolve on the SETTLE tab — protection is bought on the event market, which closes once resolved.

---

## 3. MARKET tab

1. Click **MARKET** — this is the event your protection was priced from (ETH ≥ $2,500, odds, strike line)
2. Stake box → leave **`10`** → click **STAKE NO ↓** → confirm once
3. Wait for **✓ Staked 10 on NO · odds moved** → odds drop **65.0% → ~59.1%**, NO pool 35 → 45
4. Right card **Prices your hedge** updates: YES $10K ≈ 5,909 · NO $10K ≈ 4,091 (odds public, positions encrypted)

---

## 4. HEDGE tab

Collateral is already deposited from PERPS — skip the right card.

1. Click **HEDGE**
2. Click **YES · event happens**
3. Notional box → type **`400`**
4. Click **🔒 OPEN ENCRYPTED HEDGE** → confirm in MetaMask
5. Wait for **✓ Opened** → your hedge shows under **Your hedges** — **note its number** (e.g. `#7`)

---

## 5. LIQUIDITY tab (be the counterparty)

1. Click **LIQUIDITY**
2. Deposit amount box → type **`1000`**
3. Click **DEPOSIT** → confirm **3 times** (mint, approve, deposit) → **✓ Deposited 1000 USDG · minted LP shares**
4. Look at the vault stats: reserve, capacity earmarked for the event, your shares
5. **Skip EARMARK CAPACITY** (already set to 100,000) and **don't click WITHDRAW ALL** — this wallet also holds the 100k seed, so it would empty the vault

---

## 6. SETTLE tab

1. Click **SETTLE**
2. Click **1 · RESOLVE EVENT** → confirm in MetaMask
3. Position id box → type **your hedge number** from step 5 of HEDGE (e.g. `7`)
4. Click **2 · SETTLE POSITION** → confirm **2 times** in MetaMask
5. Wait for **✓ Paid 400 USDG** (YES hedge + ETH ≥ $2,500)
6. Click **3 · SWEEP PREMIUMS → LPs** → confirm **2 times** (the hedge premium becomes LP yield — back on LIQUIDITY the share price ticks up)
7. Click **4 · FINALISE EVENT** → confirm in MetaMask

---

## Done ✅

If you see **⚠ only … locked / covered** → you ran out of free collateral: DEPOSIT more and retry.
If any step shows **✕** or an error → screenshot it + the Console and send it to me.
