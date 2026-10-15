'use client';

import React, { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useMarket } from '../lib/useMarket';
import { useActions, StatusLine, Field } from './ui';
import { EventChart } from './EventChart';
import { UnlockRadar } from './UnlockRadar';
import { ethers } from 'ethers';
import { ADDRESSES, HAS_ODDS_POOL, ODDS_POOL_KEY, ODDS_ROUTER_ABI, ODDS_TOKEN_ABI, YES_IS_CURRENCY0, gas } from '../config/contracts';

export function MarketConsole() {
  const { write, eventId, signer, account } = useWeb3();
  const m = useMarket();
  const { st, run } = useActions();
  const [amt, setAmt] = useState('10');

  const stake = (yes: boolean) => run('stk', async () => {
    const tx = await write!.market.stake(eventId, yes, BigInt(amt || '0')); await tx.wait();
    m.reload();
    return `Staked ${amt} on ${yes ? 'YES' : 'NO'} · odds moved`;
  });

  /** Uniswap v4: pay the other side, receive `yes ? YES : NO`. Buying YES raises the probability. */
  const trade = (yes: boolean) => run('stk', async () => {
    const amount = ethers.parseUnits(amt || '0', 18);
    const pay = new ethers.Contract(yes ? ADDRESSES.oddsNo : ADDRESSES.oddsYes, ODDS_TOKEN_ABI, signer);
    if ((await pay.balanceOf(account)) < amount) { const t = await pay.mint(account, amount); await t.wait(); } // testnet tokens
    if ((await pay.allowance(account, ADDRESSES.oddsRouter)) < amount) { const t = await pay.approve(ADDRESSES.oddsRouter, ethers.MaxUint256); await t.wait(); }
    const router = new ethers.Contract(ADDRESSES.oddsRouter, ODDS_ROUTER_ABI, signer);
    const tx = await router.swapExactIn(ODDS_POOL_KEY, yes ? !YES_IS_CURRENCY0 : YES_IS_CURRENCY0, amount, 0, { gasLimit: gas(500_000) }); await tx.wait();
    m.reload();
    return `Bought ${yes ? 'YES' : 'NO'} with ${amt} ${yes ? 'NO' : 'YES'} on Uniswap v4 · odds moved`;
  });

  const total = m.yesPool + m.noPool || 1;
  const yesPct = HAS_ODDS_POOL ? m.probPct : (m.yesPool / total) * 100;
  const noPct = 100 - yesPct;

  return (
    <div className="flex flex-col gap-3">
      <EventChart />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-3">
      {/* the market */}
      <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="neo-badge-cyan px-2 py-0.5 text-[12.5px]" style={{ background: '#f5f3ff', color: '#6d28d9', borderColor: '#ddd6fe' }}>PREDICTION MARKET</span>
          <h2 className="font-black text-lg">Public odds{HAS_ODDS_POOL && <span className="font-mono text-[12px] text-slate-500 font-normal"> · a Uniswap v4 pool</span>}</h2>
        </div>

        {/* big odds */}
        <div className="neo-card-sm bg-slate-50 p-4 text-center">
          <div className="font-mono text-[12px] uppercase tracking-widest text-slate-600">{HAS_ODDS_POOL ? 'Implied P(event) = price of YES in the Uniswap v4 pool' : 'Implied P(event) = yesPool / total'}</div>
          <div className="font-black text-6xl mono-num" style={{ color: '#6d28d9' }}>{m.probPct.toFixed(1)}<span className="text-2xl">%</span></div>
        </div>

        {/* YES/NO split bar */}
        <div>
          <div className="flex justify-between font-mono text-[12.5px] mb-1">
            <span className="font-black" style={{ color: '#059669' }}>YES {yesPct.toFixed(1)}%</span>
            <span className="font-black" style={{ color: '#e11d48' }}>{noPct.toFixed(1)}% NO</span>
          </div>
          <div className="flex h-9 rounded-full overflow-hidden border border-slate-900/10" style={{ boxShadow: 'inset 0 1px 2px rgba(15,23,42,.06)' }}>
            <div style={{ width: `${yesPct}%`, background: '#10b981' }} className="border-r border-white" />
            <div style={{ width: `${noPct}%`, background: '#e11d48' }} />
          </div>
          {!HAS_ODDS_POOL && (
            <div className="flex justify-between font-mono text-[12.5px] mt-1 text-slate-700">
              <span>YES pool: <b>{m.yesPool.toLocaleString()}</b></span>
              <span>NO pool: <b>{m.noPool.toLocaleString()}</b></span>
            </div>
          )}
        </div>

        {/* stake to move odds */}
        <hr className="border-t border-slate-900/10" />
        <Field label={HAS_ODDS_POOL ? 'Trade size (a swap on Uniswap v4)' : 'Stake (moves the odds)'} value={amt} onChange={setAmt} suffix={HAS_ODDS_POOL ? 'tokens' : 'units'} />
        <div className="grid grid-cols-2 gap-2">
          <button className="neo-btn neo-btn-green" onClick={() => (HAS_ODDS_POOL ? trade(true) : stake(true))} disabled={st.stk?.kind === 'busy' || !m.open}>{HAS_ODDS_POOL ? 'BUY YES ↑' : 'STAKE YES ↑'}</button>
          <button className="neo-btn neo-btn-coral" onClick={() => (HAS_ODDS_POOL ? trade(false) : stake(false))} disabled={st.stk?.kind === 'busy' || !m.open}>{HAS_ODDS_POOL ? 'BUY NO ↓' : 'STAKE NO ↓'}</button>
        </div>
        {HAS_ODDS_POOL && (
          <p className="font-mono text-[12px] text-slate-500">
            The hook freezes this pool between a round&apos;s expiry and the next round&apos;s open. Testnet odds tokens are free to mint and are not redeemable yet.
          </p>
        )}
        <StatusLine s={st.stk} />
        {!m.open && <div className="font-mono text-[12.5px] text-[#e11d48]">Market closed / resolved — staking disabled.</div>}
      </div>

      {/* how it feeds the hedge */}
      <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
        <h3 className="font-black text-base">Prices your hedge</h3>
        <div className="neo-card-sm bg-slate-50 p-3 font-mono text-[13px]">
          premium = size · <span style={{ color: '#6d28d9' }} className="font-black">p</span> / 10000
        </div>
        <Line k="YES · hedge $10k" v={`${(m.probYesBps).toLocaleString()} USDG`} />
        <Line k="NO · hedge $10k" v={`${(10000 - m.probYesBps).toLocaleString()} USDG`} />
        <p className="font-mono text-[12.5px] text-slate-600 leading-relaxed mt-1">
          Odds are public so discovery works. Your <b>position</b> (size + side) stays encrypted with
          Fhenix — you price off this number, you don&apos;t trade here.
        </p>
      </div>
      </div>
      <UnlockRadar />
    </div>
  );
}

function Line({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-gray-200 pb-1.5">
      <span className="font-mono text-[12.5px] uppercase tracking-wide text-slate-600">{k}</span>
      <span className="font-black mono-num" style={c ? { color: c } : undefined}>{v}</span>
    </div>
  );
}
