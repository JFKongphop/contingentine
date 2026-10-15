'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useActions, StatusLine } from './ui';
import { CHAIN, GATEWAY_ABI, GATEWAY_ADDRESS, NOTE_SIZES, USDG_DECIMALS } from '../config/contracts';
import { ACTION_ENTER, ACTION_WITHDRAW, decodeNote, encodeNote, innerOf, newNote, nullifierHashOf, proveSpend, toHex32 } from '../lib/zk';

const EXPLORER = `${CHAIN.explorer}/tx/`;
const short = (x: string) => `${x.slice(0, 8)}…${x.slice(-6)}`;

interface Receipt { kind: 'deposit' | 'spend'; hash: string; rows: [string, string][] }

/** Zero-knowledge entry and exit: deposit from one wallet, arrive at another, with no on-chain link between them. */
export function PrivateEntry({ onGoPerps }: { onGoPerps: () => void }) {
  const { account, signer, read, write } = useWeb3();
  const { st, run } = useActions();
  const [size, setSize] = useState(NOTE_SIZES[NOTE_SIZES.length - 1]);
  const [myNote, setMyNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [recipient, setRecipient] = useState('');
  const [action, setAction] = useState(ACTION_ENTER);
  const [relayer, setRelayer] = useState(false);
  const [deposits, setDeposits] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const gatewayRead = useMemo(
    () => (GATEWAY_ADDRESS ? new ethers.Contract(GATEWAY_ADDRESS, GATEWAY_ABI, read.usdg.runner) : null),
    [read],
  );

  const refreshCount = useCallback(() => {
    gatewayRead?.getLeaves().then((l: string[]) => setDeposits(l.length)).catch(() => {});
  }, [gatewayRead]);

  useEffect(() => {
    refreshCount();
    fetch('/api/relay').then((r) => r.json()).then((j) => setRelayer(!!j.enabled)).catch(() => {});
    Promise.resolve().then(() => { try { setMyNote(localStorage.getItem('contingent-last-note') ?? ''); } catch {} });
  }, [refreshCount]);

  const deposit = () => run('dep', async () => {
    const amount = ethers.parseUnits(String(size), USDG_DECIMALS);
    const note = newNote(amount);
    const text = encodeNote(note);
    // keep the note before any money moves: a deposit without its note cannot be spent
    try { localStorage.setItem('contingent-last-note', text); } catch {}
    setMyNote(text);
    const gateway = new ethers.Contract(GATEWAY_ADDRESS, GATEWAY_ABI, signer);
    let tx = await write!.usdg.mint(account, amount); await tx.wait();
    tx = await write!.usdg.approve(GATEWAY_ADDRESS, amount); await tx.wait();
    tx = await gateway.deposit(toHex32(innerOf(note)), amount); await tx.wait();
    setReceipts((r) => [{ kind: 'deposit', hash: tx.hash, rows: [['From', short(account!)], ['Amount', `${size} USDG`], ['Note', 'only a hash of it']] }, ...r]);
    refreshCount();
    return `Deposited ${size} USDG. Save the note below, then switch to a fresh wallet.`;
  });

  const spend = () => run('spend', async () => {
    const note = decodeNote(noteText);
    const to = (recipient || account || '').trim();
    if (!ethers.isAddress(to)) throw new Error('Enter the address that should receive the funds');
    const leaves = ((await gatewayRead!.getLeaves()) as string[]).map((x) => BigInt(x));
    if (await gatewayRead!.spent(toHex32(nullifierHashOf(note)))) throw new Error('This note was already spent');
    const { args, ms } = await proveSpend(note, leaves, to, action);
    const call = [args.pA, args.pB, args.pC, args.root, args.nullifierHash, args.amount, args.recipient, args.action] as const;
    let hash: string;
    if (relayer) {
      const r = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Relayer refused');
      hash = j.hash;
      await read.usdg.runner!.provider!.waitForTransaction(hash);
    } else {
      const tx = await new ethers.Contract(GATEWAY_ADDRESS, GATEWAY_ABI, signer).spend(...call);
      await tx.wait();
      hash = tx.hash;
    }
    const amount = ethers.formatUnits(note.amount, USDG_DECIMALS);
    setReceipts((r) => [{
      kind: 'spend', hash,
      rows: [['To', short(to)], ['Amount', `${amount} ${action === ACTION_ENTER ? 'cUSDG' : 'USDG'}`], ['Which deposit', 'not revealed'], ['Sent by', relayer ? 'relayer' : short(account!)]],
    }, ...r]);
    return `Proved in ${ms} ms. ${amount} ${action === ACTION_ENTER ? 'confidential USDG arrived' : 'USDG withdrawn'} at ${short(to)}.`;
  });

  if (!GATEWAY_ADDRESS) {
    return (
      <div className="neo-card bg-white p-4">
        <h2 className="font-black text-lg">Private entry</h2>
        <p className="font-mono text-[12.5px] text-slate-600 mt-1">The Shielded Gateway is not deployed on this network yet. Set NEXT_PUBLIC_GATEWAY to its address.</p>
      </div>
    );
  }

  const busy = (k: string) => st[k]?.kind === 'busy';
  return (
    <div className="flex flex-col gap-3">
      <div className="neo-card bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-xl leading-tight">FHE hides how much. ZK hides who.</h2>
          <p className="font-mono text-[12.5px] text-slate-600 mt-1 max-w-[720px]">
            Deposit from one wallet and keep a secret note. Any other wallet that holds the note proves it owns one of the deposits, without showing which, and receives the funds.
          </p>
        </div>
        <div className="neo-card-sm px-3 py-2 bg-white text-right">
          <div className="font-mono text-[12px] uppercase tracking-wider text-slate-600">Deposits in the pool</div>
          <div className="font-black text-lg mono-num leading-tight">{deposits ?? '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
          <div className="flex items-center gap-2"><span className="neo-pill px-2 py-0.5 text-[12.5px] bg-white">1</span><h3 className="font-black text-base">Deposit · wallet A</h3></div>
          <div>
            <div className="font-mono text-[12px] uppercase tracking-wider text-slate-600 mb-1">Note size</div>
            <div className="flex gap-2">
              {NOTE_SIZES.map((n) => (
                <button key={n} className="neo-btn neo-btn-sm" onClick={() => setSize(n)}
                  style={size === n ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : { background: '#fff' }}>
                  {n.toLocaleString()} USDG
                </button>
              ))}
            </div>
            <p className="font-mono text-[12px] text-slate-500 mt-1">Fixed sizes only: a custom amount would link the two wallets by itself.</p>
          </div>
          <button className="neo-btn neo-btn-green" onClick={deposit} disabled={busy('dep')}>{busy('dep') ? '…' : 'MINT TEST USDG + DEPOSIT'}</button>
          <StatusLine s={st.dep} />
          {myNote && (
            <div className="neo-card-sm bg-slate-50 p-3 flex flex-col gap-2">
              <div className="font-mono text-[12px] uppercase tracking-wider text-slate-600">Your note · this is the money, keep it secret</div>
              <code className="font-mono text-[12px] break-all select-all">{myNote}</code>
              <div className="flex gap-2">
                <button className="neo-btn neo-btn-white neo-btn-sm" onClick={() => navigator.clipboard?.writeText(myNote)}>COPY</button>
                <button className="neo-btn neo-btn-white neo-btn-sm" onClick={() => setNoteText(myNote)}>USE IN STEP 2</button>
              </div>
            </div>
          )}
        </div>

        <div className="neo-card bg-white p-3.5 flex flex-col gap-3">
          <div className="flex items-center gap-2"><span className="neo-pill px-2 py-0.5 text-[12.5px] bg-white">2</span><h3 className="font-black text-base">Arrive · fresh wallet B</h3></div>
          <label className="block">
            <div className="font-mono text-[12px] uppercase tracking-wider text-slate-600 mb-1">Note</div>
            <textarea className="neo-input px-3 py-2 w-full font-mono text-[12px]" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="contingent-note-v1-…" />
          </label>
          <label className="block">
            <div className="font-mono text-[12px] uppercase tracking-wider text-slate-600 mb-1">Receiving address</div>
            <input className="neo-input px-3 py-2 w-full font-mono text-[12.5px]" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={account ?? '0x…'} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[[ACTION_ENTER, 'ENTER CONTINGENT', 'arrives as confidential USDG'], [ACTION_WITHDRAW, 'WITHDRAW', 'arrives as plain USDG']].map(([id, label, sub]) => (
              <button key={id} className="neo-btn neo-btn-sm flex-col !items-start text-left" onClick={() => setAction(id as number)}
                style={action === id ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : { background: '#fff' }}>
                <span>{label}</span><span className="font-mono text-[11px] font-normal opacity-80 normal-case">{sub}</span>
              </button>
            ))}
          </div>
          <button className="neo-btn neo-btn-cyan" onClick={spend} disabled={busy('spend')}>{busy('spend') ? 'PROVING…' : 'PROVE + SEND'}</button>
          <p className="font-mono text-[12px] text-slate-500">
            {relayer ? 'A relayer pays the gas, so the fresh wallet needs none. It cannot redirect the funds: the address is fixed inside the proof.' : 'No relayer is configured, so the connected wallet sends the transaction and pays the gas.'}
          </p>
          <StatusLine s={st.spend} />
          {st.spend?.kind === 'ok' && action === ACTION_ENTER && (
            <button className="neo-btn neo-btn-white neo-btn-sm self-start" onClick={onGoPerps}>GO TO PERPS → DEPOSIT COLLATERAL</button>
          )}
        </div>
      </div>

      {receipts.length > 0 && (
        <div className="neo-card bg-white p-3.5 flex flex-col gap-2">
          <h3 className="font-black text-base">What the chain saw</h3>
          {receipts.map((r) => (
            <div key={r.hash} className="neo-card-sm bg-slate-50 p-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="neo-pill px-2 py-0.5 text-[12.5px] bg-white uppercase">{r.kind}</span>
              {r.rows.map(([k, v]) => (
                <span key={k} className="font-mono text-[12.5px]"><span className="text-slate-500">{k}: </span><b>{v}</b></span>
              ))}
              <a className="font-mono text-[12.5px] underline ml-auto" href={EXPLORER + r.hash} target="_blank" rel="noreferrer">{short(r.hash)}</a>
            </div>
          ))}
          <p className="font-mono text-[12px] text-slate-500">Nothing in the second transaction points at the first. An observer only learns that one of the {deposits ?? 'pooled'} deposits was spent.</p>
        </div>
      )}

      <div className="neo-card bg-white p-3.5">
        <h3 className="font-black text-base">Honest limits</h3>
        <ul className="font-mono text-[12.5px] text-slate-600 mt-1 list-disc pl-5 flex flex-col gap-0.5">
          <li>The hiding is only as strong as the number of other deposits of the same size.</li>
          <li>The amount that arrives is the note size. What you do with it afterwards is encrypted.</li>
          <li>The proving key comes from a single-party setup: fine on testnet, not for production.</li>
        </ul>
      </div>
    </div>
  );
}
