# Arc Mainnet read-only indexer

This worker only reads Arc JSON-RPC and writes verified chain observations to PostgreSQL. It has no signer, contract-write, trade, liquidation, keeper, or LP-deposit path.

## Runtime layout

- The Vercel API reads the database through `ARC_INDEX_DATABASE_URL` and should use the `cluster_arc_api_reader` role.
- The GitHub Actions scheduled worker uses `CLUSTER_INDEX_WORKER_DATABASE_URL` as `DATABASE_URL` and the `cluster_arc_indexer` role. The checked-in workflow runs one bounded backfill pass every five minutes, serializes runs, and resumes from the database checkpoint. Public standard GitHub-hosted runners do not incur runner-minute charges; GitHub documents a six-hour job ceiling, a five-minute minimum schedule interval, and that schedules can be delayed or dropped under load. This is a polling architecture, not a real-time delivery SLA.
- `ARC_INDEX_RPC_PRIMARY` and `ARC_INDEX_RPC_SECONDARY` may be configured as repository variables. The workflow defaults to the two public Arc RPC endpoints verified for chain 5042; both endpoints remain subject to provider availability and rate limits.

## Provisioning and credentials

Create a durable PostgreSQL database with TLS and a connection pooler suitable for short-lived API functions. Create separate owner, worker, and read-only API roles. Store their connection strings only in the relevant GitHub/Vercel secret stores. The API role must not be able to mutate indexed records; the worker must not own the schema or apply DDL during routine runs.

As the database owner, run the migration command once:

```sh
ARC_INDEX_MIGRATION_DATABASE_URL="$OWNER_DATABASE_URL" pnpm --filter @arcmemeperps/indexer arc:migrate
```

Then apply `operations/arc-indexer-grants.sql` as the schema owner after creating the two named roles. The migration files are repeatable, but they are not run automatically by the worker. The separate `arc:migrate` command uses the owner URL only for this one-time schema operation.

For a one-shot local or scheduled index pass:

```sh
DATABASE_URL="$WORKER_DATABASE_URL" \
ARC_INDEX_RPC_PRIMARY="https://rpc.mainnet.arc.io" \
ARC_INDEX_RPC_SECONDARY="https://rpc.quicknode.mainnet.arc.io" \
pnpm --filter @arcmemeperps/indexer arc:backfill
```

For a long-running container, run the one-time migration separately and then use the existing Docker command. Every window remains atomic; stopping the worker does not advance a partial checkpoint. Reorg replay and receipt checks use the same durable journal.

## Activation boundary

The scheduled workflow only runs from the default branch. It cannot become operational until the workflow is approved into that branch and `CLUSTER_INDEX_WORKER_DATABASE_URL` is configured. The API likewise remains unavailable for indexed endpoints until `ARC_INDEX_DATABASE_URL` is configured. Neither deployment is activated by this draft PR.
