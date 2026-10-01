import { GenericEvmChainAdapter, SolanaChainAdapter } from "@arcmemeperps/chain-adapters";
import { NETWORK_CONFIGS, rpcUrlsForNetwork, type SupportedChain } from "@arcmemeperps/shared";

const SMOKE_TOKENS: Readonly<Record<SupportedChain, string>> = {
  ARC: "0x3600000000000000000000000000000000000000",
  SOLANA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  ETHEREUM: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  BASE: "0x4200000000000000000000000000000000000006",
  BNB: "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  ROBINHOOD: "0xb8DBf92F9741c9ac1c32115E78581f23509916FD",
};

async function main(): Promise<void> {
  const results: unknown[] = [];
  for (const chain of Object.keys(SMOKE_TOKENS) as SupportedChain[]) {
    const started = Date.now();
    try {
      const config = NETWORK_CONFIGS[chain];
      const adapter =
        chain === "SOLANA"
          ? new SolanaChainAdapter(NETWORK_CONFIGS.SOLANA, {
              noEnrichment: true,
              rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.SOLANA),
            })
          : new GenericEvmChainAdapter(
              config as Extract<(typeof NETWORK_CONFIGS)[SupportedChain], { kind: "EVM" }>,
              { noEnrichment: true, rpcUrls: rpcUrlsForNetwork(config) },
            );
      const record = await adapter.inspectToken(SMOKE_TOKENS[chain], { noEnrichment: true });
      results.push({
        network: config.name,
        chain,
        chainIdOrSlot: record.assessmentPosition.blockNumber ?? record.assessmentPosition.slot,
        tokenAddress: SMOKE_TOKENS[chain],
        rpcOrProviderSuccess: record.providerAvailability.map((item) => ({
          provider: item.provider,
          status: item.status,
          reason: item.reason,
        })),
        evidenceClassesAvailable: record.evidence
          .filter((item) => item.status === "AVAILABLE")
          .map((item) => item.kind),
        unavailable: record.evidence
          .filter((item) => item.status !== "AVAILABLE")
          .map((item) => ({ kind: item.kind, reason: item.unavailableReason ?? item.status })),
        errors: record.evidence
          .filter((item) => item.status === "ERROR")
          .map((item) => item.unavailableReason),
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      results.push({
        network: NETWORK_CONFIGS[chain].name,
        chain,
        tokenAddress: SMOKE_TOKENS[chain],
        rpcOrProviderSuccess: false,
        evidenceClassesAvailable: [],
        unavailable: [],
        errors: [error instanceof Error ? error.message : "unknown error"],
        latencyMs: Date.now() - started,
      });
    }
  }
  process.stdout.write(
    `${JSON.stringify({ readOnly: true, writesPerformed: false, results }, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "live smoke failed"}\n`);
  process.exitCode = 1;
});
