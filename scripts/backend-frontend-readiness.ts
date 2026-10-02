import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const matrixPath = new URL("../docs/BACKEND_FEATURE_MATRIX.md", import.meta.url);
const requiredPaths = [
  "packages/domain/src/canonical.ts",
  "packages/persistence/src/index.ts",
  "packages/backend-runtime/src/index.ts",
  "apps/indexer/src/index.ts",
  "apps/api/src/server.ts",
  "apps/keeper/src/index.ts",
  "apps/reporter/src/index.ts",
  "packages/backend-completion/src/index.ts",
  "packages/backend-completion/src/index.test.ts",
  "docs/EXTERNAL_BLOCKER_REVIEW.md",
  "docs/BACKEND_GAPS.md",
];

const matrix = await readFile(matrixPath, "utf8");
const persistenceSource = await readFile(
  new URL("../packages/persistence/src/index.ts", import.meta.url),
  "utf8",
);
const rows = matrix
  .split(/\r?\n/)
  .filter(
    (line) =>
      line.startsWith("|") && !line.includes("---") && !line.toLowerCase().includes("status"),
  );
const allowed = new Set([
  "IMPLEMENTED",
  "PARTIAL",
  "NOT_IMPLEMENTED",
  "EXTERNAL_BLOCKED",
  "RELEASE_ONLY",
]);
const incomplete: string[] = [];
const malformed: string[] = [];
const counts = new Map<string, number>();
for (const row of rows) {
  const columns = row
    .split("|")
    .map((column) => column.trim())
    .filter(Boolean);
  if (columns.length < 9) {
    malformed.push(row);
    continue;
  }
  const status = columns[2]!;
  counts.set(status, (counts.get(status) ?? 0) + 1);
  if (!allowed.has(status)) malformed.push(row);
  if (status === "PARTIAL" || status === "NOT_IMPLEMENTED")
    incomplete.push(`${columns[0]} / ${columns[1]}`);
  if (
    status === "EXTERNAL_BLOCKED" &&
    !/unavailable|credential|documented|fallback|external/i.test(row)
  )
    incomplete.push(
      `${columns[0]} / ${columns[1]} (external block lacks safe fallback explanation)`,
    );
}
if (matrix.includes("INTENTIONALLY_DEFERRED"))
  malformed.push("INTENTIONALLY_DEFERRED is not an allowed Gate 4E status");
if (!persistenceSource.includes("PERSISTENCE_SCHEMA_VERSION = 3"))
  incomplete.push("persistence schema migration v3");
for (const requiredPath of requiredPaths) {
  try {
    await access(new URL(`../${requiredPath}`, import.meta.url));
  } catch {
    incomplete.push(`missing required backend boundary: ${requiredPath}`);
  }
}
if (malformed.length > 0) {
  console.error(`BACKEND_READINESS=FAIL malformed ledger rows: ${malformed.length}`);
  process.exitCode = 1;
} else if (incomplete.length > 0) {
  console.error(`BACKEND_READINESS=FAIL incomplete planned features: ${incomplete.length}`);
  for (const item of incomplete) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(
    `BACKEND_READINESS=PASS rows=${rows.length} implemented=${counts.get("IMPLEMENTED") ?? 0} external=${counts.get("EXTERNAL_BLOCKED") ?? 0} releaseOnly=${counts.get("RELEASE_ONLY") ?? 0}`,
  );
}
