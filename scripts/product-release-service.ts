import { spawn } from "node:child_process";

const children = [
  spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/gate4i-live-backend.ts",
      "--serve",
      "--host=0.0.0.0",
      `--port=${process.env.PORT ?? "8787"}`,
      "--db=/data/product-live.sqlite",
      "--poll-ms=30000",
    ],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["--import", "tsx", "scripts/product-release-worker.ts"], {
    stdio: "inherit",
  }),
];
let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill(signal);
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
for (const child of children)
  child.once("exit", (code) => {
    if (!shuttingDown && code !== 0) process.exitCode = code ?? 1;
    if (!shuttingDown) shutdown("SIGTERM");
  });
