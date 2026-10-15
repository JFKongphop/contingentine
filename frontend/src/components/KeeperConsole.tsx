'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useMarket } from '../lib/useMarket';
import { useActions, StatusLine, Field } from './ui';
import { decryptForTx } from '../lib/cofhe';
import { ADDRESSES, AQUA_RESERVE_ABI, HAS_AQUA, HAS_ROUNDS, ROUND_MANAGER_ABI, ROUTER_ABI, USDG_DECIMALS, gas } from '../config/contracts';

export function KeeperConsole() {
  const { write, read, provider, signer, eventId, round } = useWeb3();
  const m = useMarket();
  const { st, run } = useActions();
  const [posId, setPosId] = useState('1');
  const [pending, setPending] = useState(0); // 0 nothing, 1 resolve + open next, 2 open
  const [aquaAvailable, setAquaAvailable] = useState(0);
  const [topUp, setTopUp] = useState('1000');

  const loadExtras = useCallback(async () => {
    const runner = read.usdg.runner;
    if (HAS_ROUNDS) new ethers.Contract(ADDRESSES.roundManager, ROUND_MANAGER_ABI, runner).pending().then((p: bigint) => setPending(Number(p))).catch(() => {});
    if (HAS_AQUA) new ethers.Contract(ADDRESSES.aquaReserve, AQUA_RESERVE_ABI, runner).available().then((a: bigint) => setAquaAvailable(Number(ethers.formatUnits(a, USDG_DECIMALS)))).catch(() => {});
  }, [read]);
  useEffect(() => { loadExtras(); }, [loadExtras, round, m.reserve]);
  // a round expires on the clock, not on a state change here, so keep asking whether one is due
  useEffect(() => { const t = setInterval(loadExtras, 15_000); return () => clearInterval(t); }, [loadExtras]);

  const roll = () => run('roll', async () => {
    const rm = new ethers.Contract(ADDRESSES.roundManager, ROUND_MANAGER_ABI, signer);
    const tx = await rm.performUpkeep('0x', { gasLimit: gas(1_500_000) }); await tx.wait();
    loadExtras();
    return 'Round rolled: the expired round is resolved from the Chainlink feed and the next one is open';
  });

  const drawAqua = () => run('aqua', async () => {
    const amount = ethers.parseUnits(topUp || '0', USDG_DECIMALS);
    const router = new ethers.Contract(ADDRESSES.router, ROUTER_ABI, signer);
    const tx = await router.topUpFromAqua(amount, { gasLimit: gas(600_000) }); await tx.wait();
    loadExtras();
    return `Pulled ${topUp} USDG from makers' wallets through 1inch Aqua into the reserve`;
  });

  const resolve = () => run('res', async () => {
    const tx = await write!.market.resolve(eventId); await tx.wait();
    return `Resolved · outcome ${(await read.market.isResolved(eventId))[1] ? 'YES' : 'NO'}`;
  });

  const settle = () => run('set', async () => {
    const id = BigInt(posId || '0');
    if (await read.hedge.paid(id)) return `#${id} is already settled`;
    // a position belongs to the round it was opened in, which is not always the live one
    const [resolved] = await read.market.isResolved((await read.positions.get(id)).eventId);
    if (!resolved) throw new Error(`The round of #${id} is not resolved yet`);
    // 1. compute payout (branchless) + allowPublic — skipped if an earlier attempt already did it
    const requested = (await read.hedge.payoutHandle(id)) !== ethers.ZeroHash;
    let tx;
    if (!requested) { tx = await write!.hedge.requestSettlement(id, { gasLimit: gas(1_500_000) }); await tx.wait(); }
    // 2. off-chain decrypt of the payout handle
    const handle = await read.hedge.payoutHandle(id) as string;
    const { value, signature } = await decryptForTx(provider!, signer!, handle);
    // 3. verify on-chain + pay winner
    tx = await write!.hedge.fulfillSettlement(id, value, signature, { gasLimit: gas(800_000) }); await tx.wait();
    const paid = Number(ethers.formatUnits(value, USDG_DECIMALS));
    return paid > 0 ? `Paid ${paid.toLocaleString()} USDG to the winner` : 'Loser — payout 0';
  });

  const sweep = () => run('swp', async () => {
    let tx = await write!.hedge.requestPremiumSweep(eventId, { gasLimit: gas(800_000) }); await tx.wait();
    const handle = await read.vault.premiumPool(eventId) as string;
    const { value, signature } = await decryptForTx(provider!, signer!, handle);
    tx = await write!.hedge.sweepPremiums(eventId, value, signature, { gasLimit: gas(400_000) }); await tx.wait();
    return `Swept ${Number(ethers.formatUnits(value, USDG_DECIMALS)).toLocaleString()} USDG premium to LPs`;
  });

  const finalise = () => run('fin', async () => {
    const tx = await write!.hedge.finaliseEvent(eventId); await tx.wait();
    return 'Event finalised · capacity released';
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-2"><span className="neo-badge-yellow px-2 py-0.5 text-[12.5px]">KEEPER</span><h2 className="font-black text-lg">Settlement</h2></div>
        <button className="neo-btn neo-btn-yellow neo-btn-lg" onClick={resolve} disabled={st.res?.kind === 'busy' || m.resolved}>
          {m.resolved ? '✓ RESOLVED' : st.res?.kind === 'busy' ? 'RESOLVING…' : '1 · RESOLVE EVENT'}
        </button>
        <StatusLine s={st.res} />

        <hr className="border-t border-slate-900/10" />
        <Field label="Position id to settle" value={posId} onChange={setPosId} />
        <button className="neo-btn neo-btn-cyan neo-btn-lg" onClick={settle} disabled={st.set?.kind === 'busy'}>
          {st.set?.kind === 'busy' ? 'SETTLING (decrypt…)' : '2 · SETTLE POSITION'}
        </button>
        <StatusLine s={st.set} />
      </div>

      <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
        <h3 className="font-black text-base">Post-settlement</h3>
        <button className="neo-btn neo-btn-green neo-btn-lg" onClick={sweep} disabled={st.swp?.kind === 'busy' || !m.resolved || m.premiumsSwept}>
          {m.premiumsSwept ? '✓ PREMIUMS SWEPT' : st.swp?.kind === 'busy' ? 'SWEEPING…' : '3 · SWEEP PREMIUMS → LPs'}
        </button>
        <StatusLine s={st.swp} />
        <button className="neo-btn neo-btn-white neo-btn-lg" onClick={finalise} disabled={st.fin?.kind === 'busy'}>4 · FINALISE EVENT</button>
        <StatusLine s={st.fin} />

        {HAS_ROUNDS && (
          <>
            <hr className="border-t border-slate-900/10" />
            <div className="font-mono text-[12.5px] text-slate-600">
              Round <b>#{round?.number ?? '—'}</b> · strike <b>${round ? Math.round(round.strike).toLocaleString() : '—'}</b> · expires <b>{round ? new Date(round.deadline * 1000).toLocaleString() : '—'}</b>
            </div>
            <button className="neo-btn neo-btn-yellow" onClick={roll} disabled={st.roll?.kind === 'busy' || pending === 0}>
              {pending === 0 ? 'ROUND IS LIVE · NOTHING TO ROLL' : st.roll?.kind === 'busy' ? 'ROLLING…' : 'ROLL ROUND NOW'}
            </button>
            <p className="font-mono text-[12px] text-slate-500">A Chainlink CRE workflow makes this same call (run with the CRE simulator, which Chainlink accepts for hackathons). Anyone can make it; it only works when a round has expired.</p>
            <StatusLine s={st.roll} />
          </>
        )}
        {HAS_AQUA && (
          <>
            <hr className="border-t border-slate-900/10" />
            <Field label={`Top up reserve from 1inch Aqua · ${aquaAvailable.toLocaleString()} USDG backed`} value={topUp} onChange={setTopUp} suffix="USDG" />
            <button className="neo-btn neo-btn-white" onClick={drawAqua} disabled={st.aqua?.kind === 'busy' || aquaAvailable === 0}>PULL FROM AQUA → RESERVE</button>
            <p className="font-mono text-[12px] text-slate-500">Only the protocol owner or an authorised keeper can draw.</p>
            <StatusLine s={st.aqua} />
          </>
        )}

        <div className="neo-card-sm bg-slate-50 p-3 mt-1 grid grid-cols-2 gap-2 font-mono text-[12.5px]">
          <div><span className="text-slate-600">reserve</span><div className="font-black mono-num">{m.reserve.toLocaleString()}</div></div>
          <div><span className="text-slate-600">paid out</span><div className="font-black mono-num">{m.paidOut.toLocaleString()}</div></div>
          <div><span className="text-slate-600">capacity</span><div className="font-black mono-num">{m.capacity.toLocaleString()}</div></div>
          <div><span className="text-slate-600">swept</span><div className="font-black mono-num">{m.premiumsSwept ? 'yes' : 'no'}</div></div>
        </div>
      </div>
    </div>
  );
}
