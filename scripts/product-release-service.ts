import { spawn } from "node:child_process";

const backend = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "scripts/gate4i-live-backend.ts",
    "--serve",
    "--host=0.0.0.0",
    `--port=${process.env.PORT ?? "8787"}`,
    `--db=${process.env.PRODUCT_DATABASE_PATH ?? "/data/product-live.sqlite"}`,
    "--poll-ms=30000",
  ],
  { stdio: "inherit" },
);
let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  backend.kill(signal);
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
backend.once("exit", (code) => {
  if (!shuttingDown) process.exitCode = code ?? 1;
});
