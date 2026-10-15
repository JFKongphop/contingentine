'use client';

import React, { useEffect, useState } from 'react';
import type { Unlock } from '../app/api/unlocks/route';

type Radar = { enabled: boolean; mode?: 'upcoming' | 'recent'; items: Unlock[]; error?: string };

const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString()}`);
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Token unlocks from Tokenomist: the supply shocks a leveraged long wants protection against. */
export function UnlockRadar() {
  const [r, setR] = useState<Radar | null>(null);
  useEffect(() => {
    fetch('/api/unlocks').then((x) => x.json()).then(setR).catch(() => setR({ enabled: true, items: [], error: 'Could not load unlocks' }));
  }, []);
  if (r && !r.enabled) return null; // no TOKENOMIST_API_KEY on this deployment

  return (
    <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="neo-badge-cyan px-2 py-0.5 text-[12.5px]" style={{ background: '#fff1f2', color: '#e11d48', borderColor: '#fecdd3' }}>SUPPLY SHOCKS</span>
        <h3 className="font-black text-base">Unlock radar</h3>
        <span className="font-mono text-[12px] text-slate-500">· token unlocks from <a className="underline" href="https://tokenomist.ai" target="_blank" rel="noreferrer">Tokenomist</a></span>
      </div>
      <p className="font-mono text-[12.5px] text-slate-600 leading-relaxed">
        A large cliff unlock puts new supply in the hands of investors and teams at once, and the market often sells into
        it. {r?.mode === 'recent' ? 'Recent' : 'Upcoming'} unlocks below are when a long wants its crash capped: open a
        <b> protected long</b> or <b>buy NO</b> before the date.
      </p>
      {!r && <div className="font-mono text-[12.5px] text-slate-500">Loading unlocks…</div>}
      {r?.error && <div className="font-mono text-[12.5px] text-[#e11d48]">{r.error}</div>}
      {r && !r.error && r.items.length === 0 && <div className="font-mono text-[12.5px] text-slate-500">No cliff unlocks in the window.</div>}
      {r && r.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[12.5px]">
            <thead>
              <tr className="text-left uppercase tracking-wide text-slate-500 border-b border-slate-900/10">
                <th className="py-1.5 pr-3">Token</th><th className="py-1.5 pr-3">{r.mode === 'recent' ? 'Unlocked' : 'Unlocks'}</th>
                <th className="py-1.5 pr-3 text-right">Value</th><th className="py-1.5 pr-3 text-right">% of mcap</th><th className="py-1.5">Mostly to</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((u) => (
                <tr key={`${u.slug}-${u.date}`} className="border-b border-dashed border-gray-200">
                  <td className="py-1.5 pr-3 font-black">{u.symbol}</td>
                  <td className="py-1.5 pr-3">{day(u.date)}</td>
                  <td className="py-1.5 pr-3 text-right mono-num">{usd(u.valueUsd)}</td>
                  <td className="py-1.5 pr-3 text-right mono-num font-black" style={{ color: u.pctOfMcap >= 1 ? '#e11d48' : undefined }}>{u.pctOfMcap.toFixed(2)}%</td>
                  <td className="py-1.5 text-slate-600">{u.topAllocation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
