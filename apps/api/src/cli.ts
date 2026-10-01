import { writeFile } from "node:fs/promises";
import type { EvidenceBundle } from "@arcmemeperps/domain";
import { GenericEvmChainAdapter, SolanaChainAdapter } from "@arcmemeperps/chain-adapters";
import {
  qualificationCommitmentFromProof,
  qualificationCommitmentHash,
  qualificationProofFromAssessment,
  qualificationProofHash,
} from "@arcmemeperps/qualification-proof";
import { assessRisk, RISK_RULE_VERSION } from "@arcmemeperps/risk-engine";
import { NETWORK_CONFIGS, rpcUrlsForNetwork, type SupportedChain } from "@arcmemeperps/shared";

interface CliOptions {
  readonly chain: SupportedChain;
  readonly token: string;
  readonly json: boolean;
  readonly output: string | null;
  readonly noEnrichment: boolean;
}

const CHAIN_ALIASES: Readonly<Record<string, SupportedChain>> = {
  arc: "ARC",
  solana: "SOLANA",
  ethereum: "ETHEREUM",
  eth: "ETHEREUM",
  base: "BASE",
  bnb: "BNB",
  robinhood: "ROBINHOOD",
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const adapter =
    options.chain === "SOLANA"
      ? new SolanaChainAdapter(NETWORK_CONFIGS.SOLANA, {
          noEnrichment: options.noEnrichment,
          rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.SOLANA),
        })
      : new GenericEvmChainAdapter(NETWORK_CONFIGS[options.chain], {
          noEnrichment: options.noEnrichment,
          rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS[options.chain]),
        });
  const record = await adapter.inspectToken(options.token, { noEnrichment: options.noEnrichment });
  const assessment = assessRisk(record, { assessedAt: new Date().toISOString() });
  const bundle: EvidenceBundle = {
    schemaVersion: record.evidenceSchemaVersion,
    records: record.evidence,
  };
  const proof = qualificationProofFromAssessment(assessment, bundle, record.assessmentPosition);
  const proofCommitment = qualificationCommitmentFromProof(proof);
  const report = {
    identity: {
      marketId: record.marketId,
      chain: record.token.chain,
      tokenAddress: record.token.tokenAddress,
      symbol: record.token.symbol,
      name: record.token.name,
      decimals: record.token.decimals,
    },
    network: NETWORK_CONFIGS[options.chain],
    lifecycle: record.lifecycle,
    marketData: {
      liquidity: record.liquidity,
      oracle: record.oracle,
      derivativesInputs: record.derivatives,
    },
    security: {
      authorities: record.authorities,
      holders: record.holders,
      deployer: record.deployer,
    },
    providerAvailability: record.providerAvailability,
    evidence: {
      root: record.evidenceRoot,
      assessmentPosition: record.assessmentPosition,
      records: record.evidence,
    },
    freshnessAndDisagreements: record.dataQuality,
    integrityAssessment: {
      status: assessment.integrityStatus,
      hardGates: assessment.hardGates,
      reasons: assessment.rejectionReasons,
      warnings: assessment.warnings,
    },
    derivativesAssessment: {
      status: assessment.derivativesStatus,
      reasons: assessment.rejectionReasons,
      warnings: assessment.warnings,
      parameters: {
        maxLeverage: assessment.recommendedMaxLeverage,
        maxOI: assessment.recommendedMaxOI,
        maxPosition: assessment.recommendedMaxPosition,
      },
    },
    qualification: {
      eligible:
        assessment.integrityStatus === "QUALIFIED" &&
        assessment.derivativesStatus === "ELIGIBLE" &&
        record.dataQuality.reconciliationStatus !== "MATERIAL_DIVERGENCE",
      proofHash: qualificationProofHash(proof),
      commitmentHash: qualificationCommitmentHash(proofCommitment),
      ruleVersion: RISK_RULE_VERSION,
    },
    explicitUnknowns: record.evidence
      .filter((item) => item.status !== "AVAILABLE")
      .map((item) => ({ kind: item.kind, reason: item.unavailableReason ?? item.status })),
  };
  const serialized = JSON.stringify(
    report,
    (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  if (options.output !== null) await writeFile(options.output, `${serialized}\n`, "utf8");
  if (options.json) process.stdout.write(`${serialized}\n`);
  else process.stdout.write(humanReport(report));
}

function parseArgs(args: readonly string[]): CliOptions {
  if (args.some((arg) => /private.?key|seed.?phrase|mnemonic/i.test(arg)))
    throw new Error("private keys and seed phrases are not accepted by this read-only command");
  let chainValue: string | null = null;
  let token: string | null = null;
  let json = false;
  let output: string | null = null;
  let noEnrichment = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") json = true;
    else if (arg === "--no-enrichment") noEnrichment = true;
    else if (arg === "--chain") chainValue = args[++index] ?? null;
    else if (arg === "--token") token = args[++index] ?? null;
    else if (arg === "--output") output = args[++index] ?? null;
    else throw new Error(`unknown argument: ${arg}`);
  }
  const chain = chainValue === null ? null : CHAIN_ALIASES[chainValue.toLowerCase()];
  if (chain === undefined || chain === null || token === null || token.trim() === "")
    throw new Error(
      "usage: pnpm market:inspect --chain <chain> --token <address> [--json] [--output <file>] [--no-enrichment]",
    );
  return { chain, token, json, output, noEnrichment };
}

function humanReport(report: {
  readonly identity: {
    readonly marketId: string;
    readonly chain: string;
    readonly tokenAddress: string;
    readonly symbol: string | null;
    readonly name: string | null;
  };
  readonly lifecycle: { readonly status: string };
  readonly integrityAssessment: { readonly status: string };
  readonly derivativesAssessment: { readonly status: string };
  readonly qualification: { readonly eligible: boolean; readonly proofHash: string };
  readonly explicitUnknowns: readonly { readonly kind: string; readonly reason: string }[];
}): string {
  return [
    `ArcMemePerps read-only market inspection`,
    `identity: ${report.identity.chain} ${report.identity.tokenAddress} (${report.identity.symbol} / ${report.identity.name})`,
    `marketId: ${report.identity.marketId}`,
    `lifecycle: ${report.lifecycle.status}`,
    `integrity: ${report.integrityAssessment.status}`,
    `derivatives: ${report.derivativesAssessment.status}`,
    `qualification eligible: ${report.qualification.eligible ? "YES" : "NO"}`,
    `proof hash: ${report.qualification.proofHash}`,
    `explicit unknowns: ${report.explicitUnknowns.length}`,
    ...report.explicitUnknowns.slice(0, 10).map((item) => `  - ${item.kind}: ${item.reason}`),
    `READ ONLY: no wallet, signing key, or blockchain write path is used.\n`,
  ].join("\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "market inspection failed"}\n`);
  process.exitCode = 1;
});
