pragma circom 2.1.6;

// Shielded Gateway note circuit (BN254, Poseidon, Merkle depth 10).
//
//   inner         = Poseidon(nullifier, secret)            -- what the depositor submits
//   leaf          = Poseidon(amount, inner)                -- computed ON-CHAIN at deposit, so the amount in a
//                                                             note is always the amount that was really paid
//   nullifierHash = Poseidon(nullifier)                    -- revealed at spend, stops double-spending
//
// The spender proves they know (nullifier, secret) for some leaf under `root`, without revealing which leaf.
// `recipient` and `action` are bound into the proof so a relayer or a front-runner cannot redirect the note.
// The Merkle inclusion template follows Unizwap's withdraw circuit.

include "node_modules/circomlib/circuits/poseidon.circom";

template Selector() {
  signal input in[2];
  signal input sel;
  signal output out;
  sel * (1 - sel) === 0;
  out <== (in[1] - in[0]) * sel + in[0];
}

template MerkleTreeInclusionProof(levels) {
  signal input leaf;
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal output root;

  signal cur[levels + 1];
  cur[0] <== leaf;
  component hashes[levels];
  component left[levels];
  component right[levels];
  for (var i = 0; i < levels; i++) {
    left[i] = Selector();
    left[i].in[0] <== cur[i];
    left[i].in[1] <== pathElements[i];
    left[i].sel <== pathIndices[i];
    right[i] = Selector();
    right[i].in[0] <== pathElements[i];
    right[i].in[1] <== cur[i];
    right[i].sel <== pathIndices[i];
    hashes[i] = Poseidon(2);
    hashes[i].inputs[0] <== left[i].out;
    hashes[i].inputs[1] <== right[i].out;
    cur[i + 1] <== hashes[i].out;
  }
  root <== cur[levels];
}

template Note(levels) {
  // public
  signal input root;
  signal input nullifierHash;
  signal input amount;
  signal input recipient;
  signal input action; // 0 = withdraw plain USDG, 1 = enter Contingent as confidential USDG
  // private
  signal input nullifier;
  signal input secret;
  signal input pathElements[levels];
  signal input pathIndices[levels];

  component nh = Poseidon(1);
  nh.inputs[0] <== nullifier;
  nh.out === nullifierHash;

  component inner = Poseidon(2);
  inner.inputs[0] <== nullifier;
  inner.inputs[1] <== secret;
  component c = Poseidon(2);
  c.inputs[0] <== amount;
  c.inputs[1] <== inner.out;

  component tree = MerkleTreeInclusionProof(levels);
  tree.leaf <== c.out;
  for (var i = 0; i < levels; i++) {
    tree.pathElements[i] <== pathElements[i];
    tree.pathIndices[i] <== pathIndices[i];
  }
  tree.root === root;

  // tie recipient and action to the proof (a constraint that uses them, so they cannot be changed afterwards)
  signal bind;
  bind <== recipient * action;
  action * (1 - action) === 0;
}

component main {public [root, nullifierHash, amount, recipient, action]} = Note(10);
