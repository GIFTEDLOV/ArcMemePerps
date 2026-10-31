import { migrateArcIndexer, runArcIndexer } from "./arc-history.js";
import { safeIndexerErrorCode } from "./safe-error.js";

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

if (process.argv.includes("--migrate-only")) {
  try {
    await migrateArcIndexer();
    process.stdout.write("ARC_INDEX_MIGRATIONS_APPLIED\n");
  } catch (error) {
    process.stderr.write(`${safeIndexerErrorCode(error)}\n`);
    process.exitCode = 1;
  }
} else {
  do {
    try {
      await runArcIndexer();
    } catch (error) {
      process.stderr.write(`${safeIndexerErrorCode(error)}\n`);
      if (!process.argv.includes("--loop")) process.exitCode = 1;
    }
    if (!process.argv.includes("--loop") || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  } while (!stopping);
}
