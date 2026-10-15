// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FHE, euint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {MerkleTreeWithHistory, Hasher} from "./zk/MerkleTreeWithHistory.sol";
import {NoteVerifier} from "./zk/NoteVerifier.sol";

interface IWrappedUSDG {
  function wrap(uint256 amount) external;
  function confidentialTransfer(address to, euint64 amount) external returns (euint64 sent);
}

/// @title ShieldedGateway - zero-knowledge entry and exit for Contingent
/// @notice FHE hides HOW MUCH a trader holds; this hides WHO. A wallet deposits a fixed amount of USDG and keeps
///         a secret note. Later ANY wallet that knows the note proves, with a Groth16 proof, that it owns one of
///         the deposits — without revealing which — and either
///           - enters Contingent: the amount arrives as confidential USDG (cUSDG) at a fresh address, or
///           - withdraws: the amount leaves as plain USDG to a fresh address.
///         The depositing wallet and the receiving wallet are not linked on-chain.
///
///         Sits in front of the protocol and only calls public functions of `ConfidentialUSDG`, so nothing
///         already deployed changes.
///
///         Honest limits: amounts are fixed sizes (a free amount would itself link the two wallets); privacy is
///         only as good as the number of other deposits of the same size; the proving key comes from a
///         single-party setup, which is fine for testnet and not for production.
/// @dev leaf = Poseidon(amount, inner), inner = Poseidon(nullifier, secret). The leaf is hashed here, on-chain,
///      so a note can never claim more than was paid in. Merkle tree and Poseidon come from Unizwap.
contract ShieldedGateway is MerkleTreeWithHistory, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint8 public constant ACTION_WITHDRAW = 0;
  uint8 public constant ACTION_ENTER = 1;
  uint32 public constant TREE_LEVELS = 10; // must match the circuit

  IERC20 public immutable usdg;
  IWrappedUSDG public immutable cusdg;
  NoteVerifier public immutable verifier;

  /// @dev note sizes this gateway accepts (USDG, 6 decimals)
  mapping(uint256 => bool) public allowedAmount;
  mapping(bytes32 => bool) public seenInner; // stops the same note being deposited twice
  mapping(bytes32 => bool) public spent; // nullifier hashes already used
  bytes32[] internal _leaves; // every leaf in order, so a client can rebuild the tree without scanning logs

  event NoteDeposited(bytes32 indexed leaf, uint32 leafIndex, uint256 amount, bytes32 inner, uint256 timestamp);
  event NoteSpent(bytes32 indexed nullifierHash, address indexed recipient, uint256 amount, uint8 action);

  constructor(address _usdg, address _cusdg, address _verifier, uint256[] memory amounts)
    MerkleTreeWithHistory(TREE_LEVELS)
  {
    usdg = IERC20(_usdg);
    cusdg = IWrappedUSDG(_cusdg);
    verifier = NoteVerifier(_verifier);
    for (uint256 i = 0; i < amounts.length; i++) {
      require(amounts[i] > 0 && amounts[i] <= type(uint64).max, "Gateway: bad amount");
      allowedAmount[amounts[i]] = true;
    }
    IERC20(_usdg).forceApprove(_cusdg, type(uint256).max);
  }

  /// @notice Pay `amount` USDG and add a note to the tree. `inner` = Poseidon(nullifier, secret), made off-chain.
  function deposit(bytes32 inner, uint256 amount) external nonReentrant returns (uint32 leafIndex) {
    require(allowedAmount[amount], "Gateway: amount not allowed");
    require(uint256(inner) < FIELD_SIZE, "Gateway: inner out of field");
    require(!seenInner[inner], "Gateway: note already deposited");
    seenInner[inner] = true;

    usdg.safeTransferFrom(msg.sender, address(this), amount);
    bytes32 leaf = bytes32(Hasher.poseidon([amount, uint256(inner)]));
    leafIndex = _insert(leaf);
    _leaves.push(leaf);
    emit NoteDeposited(leaf, leafIndex, amount, inner, block.timestamp);
  }

  /// @notice All leaves in insertion order (the tree holds at most 1,024).
  function getLeaves() external view returns (bytes32[] memory) {
    return _leaves;
  }

  /// @notice Spend a note. Anyone may submit (a relayer can pay the gas): `recipient` and `action` are part of
  ///         the proof, so the submitter cannot redirect the funds.
  function spend(
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC,
    bytes32 root,
    bytes32 nullifierHash,
    uint256 amount,
    address recipient,
    uint8 action
  ) external nonReentrant {
    require(action <= ACTION_ENTER, "Gateway: bad action");
    require(recipient != address(0), "Gateway: zero recipient");
    require(allowedAmount[amount], "Gateway: amount not allowed");
    require(!spent[nullifierHash], "Gateway: note already spent");
    require(isKnownRoot(root), "Gateway: unknown root");
    require(
      verifier.verifyProof(
        pA, pB, pC, [uint256(root), uint256(nullifierHash), amount, uint256(uint160(recipient)), uint256(action)]
      ),
      "Gateway: invalid proof"
    );
    spent[nullifierHash] = true;

    if (action == ACTION_ENTER) {
      // wrap into the gateway's own confidential balance, then move it to the recipient
      cusdg.wrap(amount);
      euint64 enc = FHE.asEuint64(uint64(amount));
      FHE.allowTransient(enc, address(cusdg));
      cusdg.confidentialTransfer(recipient, enc);
    } else {
      usdg.safeTransfer(recipient, amount);
    }
    emit NoteSpent(nullifierHash, recipient, amount, action);
  }
}
