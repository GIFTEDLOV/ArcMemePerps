import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const paths = [
  "evidence/winner-rebuild/discovery-snapshot.json",
  "evidence/winner-rebuild/real-market-intelligence.json",
  "evidence/winner-rebuild/phase2-closure.json",
] as const;

const sha256 = (path: string): string => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const output = {
  schemaVersion: "qualification-calibration-input/v1",
  frozenAtCommit: commit,
  frozenAt: new Date().toISOString(),
  contractSourceSha: "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b",
  corpus: {
    discoveryMarketCount: 104,
    enrichedCandidateCount: 20,
    sourceFiles: paths.map((path) => ({ path, sha256: sha256(path) })),
  },
  immutability: {
    ruleRunsMustReferenceTheseHashes: true,
    noSyntheticObservations: true,
    providerFailuresRemainUnavailable: true,
  },
};

writeFileSync(
  resolve(root, "evidence/winner-rebuild/calibration-input-v1.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);
process.stdout.write(JSON.stringify(output) + "\n");
