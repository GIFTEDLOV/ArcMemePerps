const baseUrl = process.env.ARCMEMEPERPS_LIVE_API ?? "http://127.0.0.1:8787/api/v1";
const marketId = "0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387";
const wallet = "0xc36fd43deaadefb349acc61b0eb664ea4a18861c";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

async function get(path: string): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15_000) });
  const body = (await response.json()) as unknown;
  return { status: response.status, body };
}

async function main(): Promise<void> {
  const paths = [
    "/markets",
    `/markets/${marketId}`,
    `/markets/${marketId}/proof`,
    `/markets/${marketId}/risk`,
    `/markets/${marketId}/pretrade`,
    `/profile/${wallet}`,
    "/competitions",
    `/notifications/${wallet}`,
    "/protocol/status",
  ];
  const results = await Promise.all(paths.map(async (path) => [path, await get(path)] as const));
  const failed = results.filter(([, result]) => result.status !== 200);
  const markets = asRecord(results.find(([path]) => path === "/markets")?.[1].body);
  const passport = asRecord(asRecord(results.find(([path]) => path === `/markets/${marketId}`)?.[1].body).market);
  const pretrade = asRecord(asRecord(results.find(([path]) => path.endsWith("/pretrade"))?.[1].body).data);
  const protocol = asRecord(results.find(([path]) => path === "/protocol/status")?.[1].body);
  const qualification = asRecord(passport.qualification);
  const oracle = asRecord(passport.oracleEvidence);
  const tradability = asRecord(passport.tradability);
  const derivatives = asRecord(passport.derivativesEvidence);
  const signer = asRecord(pretrade.signer);
  const health = asRecord(protocol.health);
  const checks = {
    productMarketExists: asArray(markets.items).some((item) => asRecord(asRecord(item).identity).marketId === marketId),
    qualified: qualification.eligible === true,
    oracleFresh: oracle.freshness === "FRESH",
    healthy: tradability.status === "LIVE",
    solvencyNotBlocked: !asArray(derivatives.reasonCodes).includes("SOLVENCY_BLOCKED"),
    pretradeAvailable: pretrade.status === "AVAILABLE" && signer.backendSigns === false,
    protocolNoCritical: Object.values(health).every((value) => value !== "CRITICAL"),
  };
  const pass = failed.length === 0 && Object.values(checks).every(Boolean);
  process.stdout.write(JSON.stringify({ mode: "LIVE", baseUrl, pass, endpoints: results.map(([path, result]) => ({ path, status: result.status })), checks, apiSchemaVersion: "v1" }, null, 2) + "\n");
  if (!pass) process.exitCode = 1;
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
