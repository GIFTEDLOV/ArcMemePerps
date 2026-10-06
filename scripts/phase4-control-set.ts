import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GenericEvmChainAdapter, SolanaChainAdapter } from "@arcmemeperps/chain-adapters";
import { assessRisk, AUDITED_RISK_RULES } from "@arcmemeperps/risk-engine";
import { NETWORK_CONFIGS, rpcUrlsForNetwork, type SupportedChain } from "@arcmemeperps/shared";

type ControlMarket = {
  readonly label: string;
  readonly chain: SupportedChain;
  readonly tokenAddress: string;
  readonly canonicalAddressSource: string;
};

const controls: readonly ControlMarket[] = [
  { label: "BONK", chain: "SOLANA", tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", canonicalAddressSource: "live DexScreener search corroborated against the canonical Solana token read" },
  { label: "WIF", chain: "SOLANA", tokenAddress: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", canonicalAddressSource: "live DexScreener search corroborated against the canonical Solana token read" },
  { label: "POPCAT", chain: "SOLANA", tokenAddress: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", canonicalAddressSource: "live DexScreener search corroborated against the canonical Solana token read" },
  { label: "MEW", chain: "SOLANA", tokenAddress: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", canonicalAddressSource: "live DexScreener search corroborated against the canonical Solana token read" },
  { label: "BOME", chain: "SOLANA", tokenAddress: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", canonicalAddressSource: "live DexScreener search corroborated against the canonical Solana token read" },
  { label: "GOAT", chain: "SOLANA", tokenAddress: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump", canonicalAddressSource: "live DexScreener search corroborated against the canonical Solana token read" },
  { label: "PEPE", chain: "ETHEREUM", tokenAddress: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", canonicalAddressSource: "live DexScreener search corroborated against the canonical EVM token read" },
  { label: "SHIB", chain: "ETHEREUM", tokenAddress: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", canonicalAddressSource: "live DexScreener search corroborated against the canonical EVM token read" },
  { label: "BRETT", chain: "BASE", tokenAddress: "0x532f27101965dd16442E59d40670FaF5eBB142E4", canonicalAddressSource: "live DexScreener search corroborated against the canonical EVM token read" },
];
const requestedLabels = process.argv.find((argument) => argument.startsWith("--labels="))
  ?.slice("--labels=".length)
  .split(",")
  .map((label) => label.trim().toUpperCase())
  .filter((label) => label.length > 0);
const selectedControls = controls.filter((control) =>
  (process.argv.includes("--solana-only") ? control.chain === "SOLANA" : true)
  && (requestedLabels === undefined || requestedLabels.includes(control.label)),
);

function adapterFor(chain: SupportedChain) {
  if (chain === "SOLANA") return new SolanaChainAdapter(NETWORK_CONFIGS.SOLANA, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.SOLANA) });
  if (chain === "ETHEREUM") return new GenericEvmChainAdapter(NETWORK_CONFIGS.ETHEREUM, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.ETHEREUM) });
  if (chain === "BASE") return new GenericEvmChainAdapter(NETWORK_CONFIGS.BASE, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.BASE) });
  throw new Error(`UNSUPPORTED_CONTROL_CHAIN:${chain}`);
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

const fetchedAt = new Date().toISOString();
const results = [];
for (const control of selectedControls) {
  try {
    const record = await adapterFor(control.chain).inspectToken(control.tokenAddress);
    const assessment = assessRisk(record, {
      assessedAt: new Date().toISOString(),
      rules: AUDITED_RISK_RULES,
      mode: "AUDITED",
    });
    results.push({
      control,
      status: "AVAILABLE",
      marketId: record.marketId,
      token: record.token,
      providerAvailability: record.providerAvailability,
      evidenceRoot: record.evidenceRoot,
      evidence: record.evidence,
      assessment: {
        integrityStatus: assessment.integrityStatus,
        derivativesStatus: assessment.derivativesStatus,
        hardGates: assessment.hardGates,
        rejectionReasons: assessment.rejectionReasons,
        unknownReasons: assessment.unknownReasons,
        warnings: assessment.warnings,
      },
      record: jsonSafe(record),
    });
  } catch (error) {
    results.push({
      control,
      status: "FAILED",
      reason: error instanceof Error ? error.message : "CONTROL_INSPECTION_FAILED",
    });
  }
}

const output = {
  schemaVersion: "winner-rebuild/phase4-control-set-v1",
  fetchedAt,
  noSyntheticData: true,
  selectionRationale: "Established, liquid meme controls are measured with the same chain-native and public-provider paths as discovery candidates; famous symbols confer no safety status.",
  controls: results,
};
const outputPath = process.env.PHASE4_CONTROL_OUTPUT ?? "evidence/winner-rebuild/phase4-control-set.json";
writeFileSync(resolve(process.cwd(), outputPath), `${JSON.stringify(jsonSafe(output), null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({ fetchedAt, controls: results.length, available: results.filter((item) => item.status === "AVAILABLE").length }) + "\n");
