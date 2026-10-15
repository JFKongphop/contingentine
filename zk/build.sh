#!/usr/bin/env bash
# Compile the circuit, run a local (single-party, testnet-only) trusted setup, export the Solidity verifier.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
circom note.circom --r1cs --wasm -o build
if [ ! -f build/pot.ptau ]; then
  snarkjs powersoftau new bn128 13 build/pot0.ptau
  snarkjs powersoftau contribute build/pot0.ptau build/pot1.ptau --name="contingent-dev" -e="$(openssl rand -hex 32)"
  snarkjs powersoftau prepare phase2 build/pot1.ptau build/pot.ptau
  rm build/pot0.ptau build/pot1.ptau
fi
snarkjs groth16 setup build/note.r1cs build/pot.ptau build/note0.zkey
snarkjs zkey contribute build/note0.zkey build/note.zkey --name="contingent-dev" -e="$(openssl rand -hex 32)"
rm build/note0.zkey
snarkjs zkey export verificationkey build/note.zkey build/verification_key.json
snarkjs zkey export solidityverifier build/note.zkey ../src/zk/NoteVerifier.sol
sed -i '' 's/contract Groth16Verifier/contract NoteVerifier/' ../src/zk/NoteVerifier.sol
echo "built: $(snarkjs r1cs info build/note.r1cs | grep -i constraints)"
