// Read-only Product Testnet evidence probe. Never creates transactions, signs
// messages, or represents this historical Testnet deployment as Mainnet.
import { readFile } from "node:fs/promises";
import { createPublicClient, http, parseAbi } from "viem";

const data = JSON.parse(await readFile(new URL("../evidence/gate4i/product-deployment.json", import.meta.url), "utf8"));
const RPC = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io";
const chain = 5042002;
const id = data.productState?.marketId;
if (data.chainId !== chain || !/^0x[0-9a-f]{64}$/i.test(id ?? "")) throw Error("INVALID_PRODUCT_EVIDENCE");
const client = createPublicClient({ transport: http(RPC, {timeout:12000,retryCount:2}) });
const observedChain = await client.getChainId();
if (observedChain !== chain) throw Error("TESTNET_CHAIN_MISMATCH");

const deployed = {};
for (const [name, address] of Object.entries(data.addresses ?? {})) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address))) throw Error("INVALID_CONTRACT_ADDRESS_"+name);
  const code = await client.getCode({address});
  deployed[name] = Boolean(code && code !== "0x");
}
if (Object.values(deployed).some(exists => !exists)) throw Error("DEPLOYED_CODE_MISSING");
const abis = {
  qualification: parseAbi(["function isApproved(bytes32) view returns (bool)"]),
  oracle: parseAbi(["function isReportUsable(bytes32) view returns (bool)", "function latestSequence(bytes32) view returns (uint64)"]),
  perp: parseAbi(["function solvencyBlocked() view returns (bool)", "function totalOpenInterest(bytes32) view returns (uint256)"]),
  lp: parseAbi(["function publicLpActive() view returns (bool)", "function totalShares() view returns (uint256)", "function custodyStatus() view returns (uint8,uint256,uint256,uint256)"]),
  margin: parseAbi(["function reconcileCustody() view returns (uint8,uint256,uint256,uint256)"]),
};
const read = (address, abi, functionName, args=[]) =>
  client.readContract({ address, abi, functionName, args });
const A=data.addresses;
const [approved,oracleFresh,seq,blocked,openInterest,lpActive,shares,lpCustody,marginCustody] = await Promise.all([
  read(A.QualificationRegistry,abis.qualification,"isApproved",[id]),
  read(A.OracleRouter,abis.oracle,"isReportUsable",[id]),
  read(A.OracleRouter,abis.oracle,"latestSequence",[id]),
  read(A.PerpEngine,abis.perp,"solvencyBlocked"),
  read(A.PerpEngine,abis.perp,"totalOpenInterest",[id]),
  read(A.PublicLPVault,abis.lp,"publicLpActive"),
  read(A.PublicLPVault,abis.lp,"totalShares"),
  read(A.PublicLPVault,abis.lp,"custodyStatus"),
  read(A.USDCMarginVault,abis.margin,"reconcileCustody"),
]);
const safe = (x) => typeof x === "bigint" ? x.toString() : x;
const r = {
  label:"LIVE_TESTNET_READ_ONLY_NOT_MAINNET",chainId:observedChain,
  checkedAt:new Date().toISOString(),block:(await client.getBlockNumber()).toString(),
  codePresent:deployed,
  market:{id,qualified:approved,oracleUsable:oracleFresh,oracleSequence:seq.toString(),openInterest:openInterest.toString()},
  protocol:{solvencyBlocked:blocked,lpDepositsEnabled:lpActive,lpShares:shares.toString()},
  lpCustody:{status:Number(lpCustody[0]),actual:safe(lpCustody[1]),expected:safe(lpCustody[2])},
  marginCustody:{status:Number(marginCustody[0]),actual:safe(marginCustody[1]),expected:safe(marginCustody[2])},
  outcome:(Number(lpCustody[0])===2 || Number(marginCustody[0])===2 || blocked) ? "FINANCIAL_HOLD" : "NO_CUSTODY_DEFICIT_OBSERVED",
};
process.stdout.write(JSON.stringify(r,null,2)+"\n");
// Fails only on objectively unsafe on-chain state, not simply an expired
// historical oracle or no approved Mainnet market.
if(r.outcome==="FINANCIAL_HOLD")process.exitCode=1;
