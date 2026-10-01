import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();

async function filesUnder(directory: string, extensions: readonly string[]): Promise<string[]> {
  const absolute = join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path, extensions)));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(path);
  }
  return files;
}

async function hashTree(
  directories: readonly string[],
  extensions: readonly string[],
): Promise<string> {
  const files = (
    await Promise.all(directories.map((directory) => filesUnder(directory, extensions)))
  )
    .flat()
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(join(root, file)));
    hash.update("\0");
  }
  return `0x${hash.digest("hex")}`;
}

const result = {
  contractSourceSha256: await hashTree(["contracts/src"], [".sol"]),
  backendSourceSha256: await hashTree(["apps", "packages", "scripts"], [".ts"]),
  schemaVersion: "backend-completion/v1",
  riskRuleVersion: "0.1.0",
  qualificationProofVersion: "2",
  apiVersion: "v1",
};
console.log(JSON.stringify(result, null, 2));
