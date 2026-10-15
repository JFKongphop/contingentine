// Relayer for the Shielded Gateway. A fresh wallet has no gas, and funding it from the depositing wallet would
// link the two again, so this server sends `spend` for the user. It cannot redirect anything: the recipient and
// the action are fixed inside the proof. Needs RELAYER_PRIVATE_KEY (a throwaway testnet key with a little gas).
import { ethers } from 'ethers';
import { ARBITRUM_SEPOLIA_RPC, GATEWAY_ABI, GATEWAY_ADDRESS } from '../../../config/contracts';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ enabled: !!(process.env.RELAYER_PRIVATE_KEY && GATEWAY_ADDRESS) });
}

export async function POST(req: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !GATEWAY_ADDRESS) return Response.json({ error: 'Relayer is not configured' }, { status: 503 });
  try {
    const a = await req.json();
    if (!ethers.isAddress(a.recipient) || (a.action !== 0 && a.action !== 1)) return Response.json({ error: 'Bad request' }, { status: 400 });
    const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(process.env.RELAYER_RPC || ARBITRUM_SEPOLIA_RPC));
    const gateway = new ethers.Contract(GATEWAY_ADDRESS, GATEWAY_ABI, wallet);
    const args = [a.pA, a.pB, a.pC, a.root, a.nullifierHash, a.amount, a.recipient, a.action] as const;
    await gateway.spend.staticCall(...args); // refuse to pay gas for a proof that would revert
    const tx = await gateway.spend(...args);
    return Response.json({ hash: tx.hash });
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (e as any)?.reason ?? (e as any)?.shortMessage ?? (e as any)?.message ?? 'Relay failed';
    return Response.json({ error: String(msg).slice(0, 200) }, { status: 400 });
  }
}
