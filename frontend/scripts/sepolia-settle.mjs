// Live settlement check on Ethereum Sepolia + the real Fhenix CoFHE service.
//   open:   mint → wrap → encrypted collateral → open an encrypted hedge on the live round
//   settle: request the payout → decrypt it off-chain → verify on-chain and pay from the vault
//
// Usage (from contingent/frontend):
//   PRIVATE_KEY=0x... SEPOLIA_RPC_URL=https://... node scripts/sepolia-settle.mjs open yes 200
//   PRIVATE_KEY=0x... SEPOLIA_RPC_URL=https://... node scripts/sepolia-settle.mjs settle <positionId>
import { ethers } from 'ethers';
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node';
import { sepolia } from '@cofhe/sdk/chains';
import { Ethers6Adapter } from '@cofhe/sdk/adapters';
import { Encryptable } from '@cofhe/sdk';

const A = {
  usdg: '0xBad4bD3148f18495D748D326bce53d4DD3473DD9',
  cusdg: '0x2d01A8692D9842fa8C924E52b445bf07d0E446e3',
  collateral: '0xe6351fD6Eceb0e70E3Be6af1f85C3df50B20fb02',
  hedge: '0xa2a98142d0203106798016E4D3e4d5d46cC4A6C8',
  market: '0xa3439c99E010D1882F8865b5380fA65aAFA88700',
  vault: '0xEE89B955F097C90e995b274a105fA837F167070D',
  nft: '0xF1d04F92EF261864886C6dD31Fc96e2bf3958a32',
  rounds: '0x9D6520b5334ef79e66f6fcE2aE54911acAb693ed',
};
// Sepolia charges about 6x what a node estimates for new storage, so fixed limits are scaled
const gas = (n) => ({ gasLimit: BigInt(n) * 6n });

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL, 11155111);
const baseWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const wallet = new ethers.NonceManager(baseWallet);
const me = baseWallet.address;
const C = (addr, abi) => new ethers.Contract(addr, abi, wallet);
const usdg = C(A.usdg, ['function mint(address,uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const cusdg = C(A.cusdg, ['function wrap(uint256)', 'function confidentialTransferAndCall(address,bytes32,bytes,bytes) returns (bytes32)']);
const hedge = C(A.hedge, [
  'function openHedge(bytes32,bytes32,bytes,bytes32,bytes) returns (uint256)',
  'function requestSettlement(uint256)',
  'function fulfillSettlement(uint256,uint64,bytes)',
  'function payoutHandle(uint256) view returns (bytes32)',
  'function paid(uint256) view returns (bool)',
  'event HedgeOpened(uint256 indexed positionId, address indexed user, bytes32 indexed eventId, uint32 entryProbBps)',
]);
const market = C(A.market, ['function isResolved(bytes32) view returns (bool,bool)', 'function probYesBps(bytes32) view returns (uint256)']);
const vault = C(A.vault, ['function totalReserve() view returns (uint256)']);
const nft = C(A.nft, ['function ownerOf(uint256) view returns (address)']);
const rounds = C(A.rounds, ['function currentEvent() view returns (bytes32)', 'function roundNumber() view returns (uint256)']);

const u = (n) => ethers.parseUnits(String(n), 6);
const f = (n) => ethers.formatUnits(n, 6);
const send = async (p) => (await p).wait();
const step = async (name, fn) => {
  const s = Date.now();
  process.stdout.write(`▶ ${name} … `);
  const r = await fn();
  console.log(`✓ ${((Date.now() - s) / 1000).toFixed(1)}s${typeof r === 'string' || typeof r === 'number' ? '  ' + r : ''}`);
  return r;
};

const client = createCofheClient(createCofheConfig({ supportedChains: [sepolia] }));
await step('connect CoFHE client', async () => {
  const { publicClient, walletClient } = await Ethers6Adapter(provider, baseWallet);
  await client.connect(publicClient, walletClient);
});
const enc64 = async (v, target) => { const r = await client.encryptInputs([Encryptable.uint64(v)]).setConsumingContract(target).execute(); return [r[0], r[r.length - 1]]; };
const encB = async (v, target) => { const r = await client.encryptInputs([Encryptable.bool(v)]).setConsumingContract(target).execute(); return [r[0], r[r.length - 1]]; };
// the threshold network can lag the transaction that made a handle public by seconds to minutes
const dec = async (h) => {
  for (let i = 0; ; i++) {
    try { const r = await client.decryptForTx(h).withoutACP().execute(); return { v: BigInt(r.decryptedValue), sig: r.signature }; }
    catch (e) { if (i >= 75) throw e; await new Promise((r) => setTimeout(r, 4000)); }
  }
};

const [mode, a1, a2] = process.argv.slice(2);
if (mode === 'open') {
  const yes = a1 === 'yes';
  const size = Number(a2 || 200);
  const eventId = await rounds.currentEvent();
  console.log(`wallet ${me} · round ${await rounds.roundNumber()} · odds ${Number(await market.probYesBps(eventId)) / 100}% YES`);
  await step(`mint + wrap ${size} USDG`, async () => {
    await send(usdg.mint(me, u(size)));
    await send(usdg.approve(A.cusdg, u(size)));
    await send(cusdg.wrap(u(size), gas(400_000)));
  });
  await step(`deposit ${size} encrypted collateral`, async () => {
    const [h, p] = await enc64(u(size), A.cusdg);
    await send(cusdg.confidentialTransferAndCall(A.collateral, h, p, '0x', gas(900_000)));
  });
  const id = await step(`open hedge: ${yes ? 'YES' : 'NO'} ${size} (encrypted size and side)`, async () => {
    const [sh, sp] = await enc64(u(size), A.hedge);
    const [dh, dp] = await encB(yes, A.hedge);
    const rc = await send(hedge.openHedge(eventId, sh, sp, dh, dp, gas(1_500_000)));
    for (const log of rc.logs) { try { const ev = hedge.interface.parseLog(log); if (ev?.name === 'HedgeOpened') return Number(ev.args.positionId); } catch {} }
    return 0;
  });
  console.log(`\n✅ hedge #${id} open on round event ${eventId}`);
} else if (mode === 'settle') {
  const id = BigInt(a1);
  if (await hedge.paid(id)) { console.log(`#${id} is already settled`); process.exit(0); }
  const owner = await nft.ownerOf(id);
  const before = await usdg.balanceOf(owner);
  const reserveBefore = await vault.totalReserve();
  await step(`request settlement of #${id}`, async () => {
    if ((await hedge.payoutHandle(id)) !== ethers.ZeroHash) return 'already requested';
    await send(hedge.requestSettlement(id, gas(1_500_000)));
  });
  const pay = await step('decrypt the payout off-chain', async () => {
    const r = await dec(await hedge.payoutHandle(id));
    return r;
  });
  await step('verify on-chain + pay the owner', async () => { await send(hedge.fulfillSettlement(id, pay.v, pay.sig, gas(800_000))); });
  const got = (await usdg.balanceOf(owner)) - before;
  const reserveDrop = reserveBefore - (await vault.totalReserve());
  console.log(`\n✅ #${id} settled: payout ${f(pay.v)} USDG · owner ${owner} received ${f(got)} USDG · vault reserve fell by ${f(reserveDrop)}`);
} else {
  console.log('usage: sepolia-settle.mjs open <yes|no> <size> | settle <positionId>');
}
process.exit(0);
