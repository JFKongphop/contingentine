import {
  cre,
  EVMClient,
  getNetwork,
  bytesToHex,
  encodeCallMsg,
  prepareReportRequest,
  LAST_FINALIZED_BLOCK_NUMBER,
  TxStatus,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { z } from "zod";

/**
 * Contingent round keeper.
 *
 * On a schedule the DON asks the RoundManager whether a round is due (the live one expired, or none is
 * open). If it is, the DON signs a report and Chainlink's forwarder delivers it to CRERoundKeeper, which
 * calls RoundManager.performUpkeep. The report is only a signal: the contracts re-check everything.
 */
const configSchema = z.object({
  chainSelectorName: z.string(),
  roundManager: z.string(),
  keeper: z.string(),
  schedule: z.string(),
  writeGasLimit: z.string(),
});
type Config = z.infer<typeof configSchema>;

const ROUNDS_ABI = parseAbi([
  "function checkUpkeep(bytes) view returns (bool upkeepNeeded, bytes performData)",
  "function pending() view returns (uint8)",
  "function roundNumber() view returns (uint256)",
]);

const ACTIONS = ["nothing to do", "resolve the expired round and open the next", "open a round"];

const read = <T>(runtime: Runtime<Config>, client: EVMClient, to: Address, data: `0x${string}`, decode: (d: `0x${string}`) => T): T => {
  const out = client
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return decode(bytesToHex(out.data));
};

const onTick = (runtime: Runtime<Config>): string => {
  const { chainSelectorName, roundManager, keeper, writeGasLimit } = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName });
  if (!network) throw new Error(`Network not found: ${chainSelectorName}`);
  const client = new EVMClient(network.chainSelector.selector);
  const rounds = roundManager as Address;

  const round = read(runtime, client, rounds, encodeFunctionData({ abi: ROUNDS_ABI, functionName: "roundNumber" }), (d) =>
    decodeFunctionResult({ abi: ROUNDS_ABI, functionName: "roundNumber", data: d }),
  );
  const action = read(runtime, client, rounds, encodeFunctionData({ abi: ROUNDS_ABI, functionName: "pending" }), (d) =>
    decodeFunctionResult({ abi: ROUNDS_ABI, functionName: "pending", data: d }),
  );
  const [needed] = read(
    runtime,
    client,
    rounds,
    encodeFunctionData({ abi: ROUNDS_ABI, functionName: "checkUpkeep", args: ["0x"] }),
    (d) => decodeFunctionResult({ abi: ROUNDS_ABI, functionName: "checkUpkeep", data: d }),
  );
  runtime.log(`Round ${round}: ${ACTIONS[Number(action)] ?? `action ${action}`}`);
  if (!needed) return `round ${round}: nothing to do`;

  // the report says which round the DON saw as due; the keeper ignores its content and re-checks on-chain
  const payload = encodeFunctionData({
    abi: parseAbi(["function roll(uint256 round, uint8 action)"]),
    functionName: "roll",
    args: [round, Number(action)],
  });
  const report = runtime.report(prepareReportRequest(payload)).result();
  const res = client.writeReport(runtime, { receiver: keeper, report, gasConfig: { gasLimit: writeGasLimit } }).result();
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`Report failed: ${res.errorMessage || res.txStatus}`);

  const tx = bytesToHex(res.txHash || new Uint8Array(32));
  runtime.log(`Round ${round} rolled: ${tx}`);
  return tx;
};

const initWorkflow = (config: Config) => [
  cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: config.schedule }), onTick),
];

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
