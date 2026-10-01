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
];

const matrix = await readFile(matrixPath, "utf8");
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
  console.log(`BACKEND_READINESS=PASS rows=${rows.length}`);
}
