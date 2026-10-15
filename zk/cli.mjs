// Command-line twin of the browser flow, for testing a deployed gateway.
//   node cli.mjs new <amount-in-base-units>                 → { note, inner }
//   node cli.mjs prove <note> <recipient> <0|1> <leaf,leaf>  → the arguments of ShieldedGateway.spend
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { randomBytes } from "node:crypto";

const LEVELS = 10;
const poseidon = await buildPoseidon();
const H = (...xs) => poseidon.F.toObject(poseidon(xs));
const hex = (x) => "0x" + BigInt(x).toString(16).padStart(64, "0");
const parse = (t) => {
  const m = t.match(/^contingent-note-v1-(\d+)-([0-9a-f]+)-([0-9a-f]+)$/i);
  if (!m) throw new Error("not a Contingent note");
  return { amount: BigInt(m[1]), nullifier: BigInt("0x" + m[2]), secret: BigInt("0x" + m[3]) };
};

const [cmd, ...a] = process.argv.slice(2);
if (cmd === "new") {
  const n = { amount: BigInt(a[0]), nullifier: BigInt("0x" + randomBytes(31).toString("hex")), secret: BigInt("0x" + randomBytes(31).toString("hex")) };
  console.log(JSON.stringify({ note: `contingent-note-v1-${n.amount}-${n.nullifier.toString(16)}-${n.secret.toString(16)}`, inner: hex(H(n.nullifier, n.secret)) }));
} else if (cmd === "prove") {
  const n = parse(a[0]);
  const leaves = a[3].split(",").filter(Boolean).map((x) => BigInt(x));
  let index = leaves.findIndex((l) => l === H(n.amount, H(n.nullifier, n.secret)));
  if (index < 0) throw new Error("note is not among the leaves");
  const zeros = [0n];
  for (let i = 1; i <= LEVELS; i++) zeros.push(H(zeros[i - 1], zeros[i - 1]));
  let layer = leaves.slice();
  const pathElements = [], pathIndices = [];
  for (let l = 0; l < LEVELS; l++) {
    pathIndices.push(index & 1);
    pathElements.push(layer[index ^ 1] ?? zeros[l]);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) next.push(H(layer[i] ?? zeros[l], layer[i + 1] ?? zeros[l]));
    layer = next;
    index >>= 1;
  }
  const input = { root: layer[0], nullifierHash: H(n.nullifier), amount: n.amount, recipient: BigInt(a[1]), action: Number(a[2]), nullifier: n.nullifier, secret: n.secret, pathElements, pathIndices };
  const dir = new URL("./build/", import.meta.url).pathname;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, dir + "note_js/note.wasm", dir + "note.zkey");
  const [pA, pB, pC] = JSON.parse("[" + (await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)) + "]");
  console.log(JSON.stringify({ pA, pB, pC, root: hex(layer[0]), nullifierHash: hex(H(n.nullifier)), amount: n.amount.toString(), recipient: a[1], action: Number(a[2]) }));
} else {
  console.error("usage: node cli.mjs new <amount> | prove <note> <recipient> <0|1> <leaves>");
  process.exit(1);
}
process.exit(0);
