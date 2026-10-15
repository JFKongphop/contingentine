'use client';

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useMarket } from '../lib/useMarket';
import { useActions, StatusLine, Field } from './ui';
import { ADDRESSES, AQUA_ABI, AQUA_RESERVE_ABI, HAS_AQUA, USDG_DECIMALS, gas } from '../config/contracts';

export function LPConsole() {
  const { write, account, read, eventId, signer } = useWeb3();
  const m = useMarket();
  const { st, run } = useActions();
  const [amount, setAmount] = useState('50000');
  const [cap, setCap] = useState('100000');
  const [shares, setShares] = useState('0');
  const [backing, setBacking] = useState('5000');
  const [aquaTotal, setAquaTotal] = useState(0);

  useEffect(() => {
    if (!HAS_AQUA) return;
    new ethers.Contract(ADDRESSES.aquaReserve, AQUA_RESERVE_ABI, read.usdg.runner).available()
      .then((a: bigint) => setAquaTotal(Number(ethers.formatUnits(a, USDG_DECIMALS)))).catch(() => {});
  }, [read, m.reserve]);

  /** 1inch Aqua: the USDG stays in the maker's wallet; only a virtual balance is shipped to the AquaReserve app. */
  const backWithAqua = () => run('aqua', async () => {
    const amt = ethers.parseUnits(backing || '0', USDG_DECIMALS);
    const reserve = new ethers.Contract(ADDRESSES.aquaReserve, AQUA_RESERVE_ABI, signer);
    const aqua = new ethers.Contract(ADDRESSES.aqua, AQUA_ABI, signer);
    const nonce = BigInt(Date.now());
    let tx = await write!.usdg.mint(account, amt); await tx.wait();
    tx = await write!.usdg.approve(ADDRESSES.aqua, ethers.MaxUint256); await tx.wait();
    const strategy = await reserve.strategyFor(account, nonce);
    tx = await aqua.ship(ADDRESSES.aquaReserve, strategy, [ADDRESSES.usdg], [amt], { gasLimit: gas(300_000) }); await tx.wait();
    tx = await reserve.register(account, nonce, { gasLimit: gas(300_000) }); await tx.wait();
    setAquaTotal((t) => t + Number(backing));
    return `Backing payouts with ${backing} USDG through 1inch Aqua · the USDG is still in your wallet`;
  });

  useEffect(() => {
    if (!account) return;
    read.vault.sharesOf(account).then((s: bigint) => setShares(ethers.formatUnits(s, USDG_DECIMALS))).catch(() => {});
  }, [account, read, m.reserve]);

  const deposit = () => run('dep', async () => {
    const amt = ethers.parseUnits(amount || '0', USDG_DECIMALS);
    let tx = await write!.usdg.mint(account, amt); await tx.wait();
    tx = await write!.usdg.approve(ADDRESSES.vault, amt); await tx.wait();
    tx = await write!.vault.deposit(amt); await tx.wait();
    return `Deposited ${amount} USDG · minted LP shares`;
  });
  const withdraw = () => run('wd', async () => {
    const s = await read.vault.sharesOf(account) as bigint;
    const tx = await write!.vault.withdraw(s); await tx.wait();
    return 'Withdrew all free shares';
  });
  const earmark = () => run('em', async () => {
    const c = ethers.parseUnits(cap || '0', USDG_DECIMALS);
    const tx = await write!.vault.earmark(eventId, c, { gasLimit: gas(500_000) }); await tx.wait();
    return `Earmarked ${cap} USDG capacity for the event`;
  });

  const spread = m.reserve - m.capacity; // rough "profit buffer" indicator
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-2"><span className="neo-badge-green px-2 py-0.5 text-[12.5px]">LP</span><h2 className="font-black text-lg">Provide liquidity</h2></div>
        <Field label="Deposit amount" value={amount} onChange={setAmount} suffix="USDG" />
        <div className="grid grid-cols-2 gap-2">
          <button className="neo-btn neo-btn-green" onClick={deposit} disabled={st.dep?.kind === 'busy'}>{st.dep?.kind === 'busy' ? '…' : 'DEPOSIT'}</button>
          <button className="neo-btn neo-btn-white" onClick={withdraw} disabled={st.wd?.kind === 'busy'}>WITHDRAW ALL</button>
        </div>
        <StatusLine s={st.dep} /><StatusLine s={st.wd} />
        <hr className="border-t border-slate-900/10" />
        <Field label="Earmark capacity for event" value={cap} onChange={setCap} suffix="USDG" />
        <button className="neo-btn neo-btn-yellow" onClick={earmark} disabled={st.em?.kind === 'busy'}>{st.em?.kind === 'busy' ? '…' : 'EARMARK CAPACITY'}</button>
        <StatusLine s={st.em} />
        {HAS_AQUA && (
          <>
            <hr className="border-t border-slate-900/10" />
            <div className="flex items-center gap-2"><span className="neo-pill px-2 py-0.5 text-[12.5px] bg-white">1INCH AQUA</span><h3 className="font-black text-base">Back payouts without depositing</h3></div>
            <Field label="Backing amount (stays in your wallet)" value={backing} onChange={setBacking} suffix="USDG" />
            <button className="neo-btn neo-btn-white" onClick={backWithAqua} disabled={st.aqua?.kind === 'busy'}>{st.aqua?.kind === 'busy' ? '…' : 'SHIP TO AQUA'}</button>
            <p className="font-mono text-[12px] text-slate-500">
              {aquaTotal.toLocaleString()} USDG is backing payouts this way. It is pulled from makers&apos; wallets only when the reserve needs topping up. This version records what each maker contributed but does not pay them for it yet.
            </p>
            <StatusLine s={st.aqua} />
          </>
        )}
      </div>

      <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
        <h3 className="font-black text-base">Reserve book</h3>
        <Row k="Total reserve" v={`${m.reserve.toLocaleString()} USDG`} c="#10b981" />
        <Row k="Earmarked (at risk)" v={`${m.earmarked.toLocaleString()} USDG`} />
        <Row k="Free (withdrawable)" v={`${m.freeReserve.toLocaleString()} USDG`} />
        <Row k="Your LP shares" v={Number(shares).toLocaleString()} />
        <Row k="Event capacity" v={`${m.capacity.toLocaleString()} USDG`} />
        <Row k="Paid out" v={`${m.paidOut.toLocaleString()} USDG`} c={m.paidOut > 0 ? '#e11d48' : undefined} />
        <p className="font-mono text-[12.5px] text-slate-600 mt-1">P&amp;L = premiums − payouts · buffer {spread.toLocaleString()} USDG</p>
      </div>
    </div>
  );
}

function Row({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-gray-200 pb-1.5">
      <span className="font-mono text-[12.5px] uppercase tracking-wide text-slate-600">{k}</span>
      <span className="font-black mono-num" style={c ? { color: c } : undefined}>{v}</span>
    </div>
  );
}
