// Build real proofs for the Foundry test: three deposits, then spend note 0 (enter) and note 2 (withdraw).
// Deterministic inputs, so the test file only changes when the circuit or the keys change.
import { mkdirSync, writeFileSync } from "node:fs";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";

const LEVELS = 10;
const poseidon = await buildPoseidon();
const H = (...xs) => poseidon.F.toObject(poseidon(xs));
const hex = (x) => "0x" + BigInt(x).toString(16).padStart(64, "0");

const AMOUNT = 1000n * 10n ** 6n;
const notes = [1n, 2n, 3n].map((i) => ({ nullifier: 1111n * i, secret: 7777n * i, amount: AMOUNT }));
for (const n of notes) {
  n.inner = H(n.nullifier, n.secret);
  n.leaf = H(n.amount, n.inner);
  n.nullifierHash = H(n.nullifier);
}

// same incremental tree as the contract: empty leaves are 0
const zeros = [0n];
for (let i = 1; i <= LEVELS; i++) zeros.push(H(zeros[i - 1], zeros[i - 1]));
function tree(leaves) {
  const layers = [leaves.slice()];
  for (let l = 0; l < LEVELS; l++) {
    const cur = layers[l], next = [];
    for (let i = 0; i < Math.max(cur.length, 1); i += 2) next.push(H(cur[i] ?? zeros[l], cur[i + 1] ?? zeros[l]));
    layers.push(next);
  }
  return layers;
}
function path(layers, index) {
  const pathElements = [], pathIndices = [];
  for (let l = 0; l < LEVELS; l++) {
    pathIndices.push(index & 1);
    pathElements.push(layers[l][index ^ 1] ?? zeros[l]);
    index >>= 1;
  }
  return { pathElements, pathIndices };
}

const layers = tree(notes.map((n) => n.leaf));
const root = layers[LEVELS][0];

async function prove(i, recipient, action) {
  const n = notes[i];
  const input = { root, nullifierHash: n.nullifierHash, amount: n.amount, recipient: BigInt(recipient), action, nullifier: n.nullifier, secret: n.secret, ...path(layers, i) };
  const t = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, "build/note_js/note.wasm", "build/note.zkey");
  const ms = Date.now() - t;
  const call = JSON.parse("[" + (await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)) + "]");
  return { pA: call[0], pB: call[1], pC: call[2], nullifierHash: hex(n.nullifierHash), recipient, action, ms };
}

const enter = await prove(0, "0x000000000000000000000000000000000000bEEF", 1);
const withdraw = await prove(2, "0x000000000000000000000000000000000000cafE", 0);
mkdirSync("../test/fixtures", { recursive: true });
writeFileSync("../test/fixtures/note-proofs.json", JSON.stringify({ amount: AMOUNT.toString(), inners: notes.map((n) => hex(n.inner)), root: hex(root), enter, withdraw }, null, 2) + "\n");
console.log(`root ${hex(root)}\nproofs: enter ${enter.ms} ms, withdraw ${withdraw.ms} ms (node)`);
process.exit(0);
