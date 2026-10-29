import { runArcIndexer } from "./arc-history.js";

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

do {
  try {
    await runArcIndexer();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    if (!process.argv.includes("--loop")) process.exitCode = 1;
  }
  if (!process.argv.includes("--loop") || stopping) break;
  await new Promise((resolve) => setTimeout(resolve, 15_000));
} while (!stopping);
