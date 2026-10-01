# Full backend feature matrix

The canonical ledger is [`BACKEND_FEATURE_MATRIX.md`](./BACKEND_FEATURE_MATRIX.md).
This alias exists so release checklists and future tooling have a stable
full-completion filename. It must not become a second competing ledger.

Run `pnpm backend:frontend-readiness` to parse the canonical table and fail if
any planned feature remains partial or not implemented.
