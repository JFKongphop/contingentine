// Shielded Gateway client: notes, the Poseidon Merkle tree and Groth16 proofs (made in the browser).
//   inner = Poseidon(nullifier, secret)   leaf = Poseidon(amount, inner)   nullifierHash = Poseidon(nullifier)
import { poseidon1, poseidon2 } from 'poseidon-lite';

export const TREE_LEVELS = 10;
export const ACTION_WITHDRAW = 0;
export const ACTION_ENTER = 1;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface Note { amount: bigint; nullifier: bigint; secret: bigint }
export const toHex32 = (x: bigint) => '0x' + x.toString(16).padStart(64, '0');

function randomField(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(31)); // 248 bits, always inside the field
  return BigInt('0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''));
}

export const newNote = (amount: bigint): Note => ({ amount, nullifier: randomField(), secret: randomField() });
export const innerOf = (n: Note) => poseidon2([n.nullifier, n.secret]);
export const leafOf = (n: Note) => poseidon2([n.amount, innerOf(n)]);
export const nullifierHashOf = (n: Note) => poseidon1([n.nullifier]);

/** The note is the money: whoever holds this string can spend it. */
export const encodeNote = (n: Note) => `contingent-note-v1-${n.amount}-${n.nullifier.toString(16)}-${n.secret.toString(16)}`;
export function decodeNote(text: string): Note {
  const m = text.trim().match(/^contingent-note-v1-(\d+)-([0-9a-f]+)-([0-9a-f]+)$/i);
  if (!m) throw new Error('That is not a Contingent note');
  const n = { amount: BigInt(m[1]), nullifier: BigInt('0x' + m[2]), secret: BigInt('0x' + m[3]) };
  if (n.nullifier >= FIELD || n.secret >= FIELD) throw new Error('Note values are out of range');
  return n;
}

/** Root and sibling path for `index`, in the same incremental tree as the contract (empty leaf = 0). */
export function merklePath(leaves: bigint[], index: number) {
  const zeros = [0n];
  for (let i = 1; i <= TREE_LEVELS; i++) zeros.push(poseidon2([zeros[i - 1], zeros[i - 1]]));
  let layer = leaves.slice();
  let idx = index;
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  for (let l = 0; l < TREE_LEVELS; l++) {
    pathIndices.push(idx & 1);
    pathElements.push(layer[idx ^ 1] ?? zeros[l]);
    const next: bigint[] = [];
    for (let i = 0; i < Math.max(layer.length, 1); i += 2) next.push(poseidon2([layer[i] ?? zeros[l], layer[i + 1] ?? zeros[l]]));
    layer = next;
    idx >>= 1;
  }
  return { root: layer[0], pathElements, pathIndices };
}

// snarkjs is loaded as a plain browser script (public/zk/snarkjs.min.js) so the bundler never touches it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let snarkjsLoading: Promise<any> | null = null;
function loadSnarkjs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.snarkjs) return Promise.resolve(w.snarkjs);
  snarkjsLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/zk/snarkjs.min.js';
    s.onload = () => resolve(w.snarkjs);
    s.onerror = () => reject(new Error('Could not load the prover'));
    document.head.appendChild(s);
  });
  return snarkjsLoading;
}

export interface SpendArgs {
  pA: [string, string]; pB: [[string, string], [string, string]]; pC: [string, string];
  root: string; nullifierHash: string; amount: string; recipient: string; action: number;
}

/** Prove ownership of `note` among `leaves` and bind the proof to `recipient` and `action`. */
export async function proveSpend(note: Note, leaves: bigint[], recipient: string, action: number): Promise<{ args: SpendArgs; ms: number }> {
  const index = leaves.findIndex((l) => l === leafOf(note));
  if (index < 0) throw new Error('This note is not in the gateway (wrong network, or the deposit is not confirmed yet)');
  const { root, pathElements, pathIndices } = merklePath(leaves, index);
  const nullifierHash = nullifierHashOf(note);
  const input = {
    root: root.toString(), nullifierHash: nullifierHash.toString(), amount: note.amount.toString(),
    recipient: BigInt(recipient).toString(), action,
    nullifier: note.nullifier.toString(), secret: note.secret.toString(),
    pathElements: pathElements.map(String), pathIndices,
  };
  const snarkjs = await loadSnarkjs();
  const t = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, '/zk/note.wasm', '/zk/note.zkey');
  const ms = Math.round(performance.now() - t);
  const [pA, pB, pC] = JSON.parse('[' + (await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)) + ']');
  return { args: { pA, pB, pC, root: toHex32(root), nullifierHash: toHex32(nullifierHash), amount: note.amount.toString(), recipient, action }, ms };
}
