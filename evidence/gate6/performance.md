# Performance observations

Production frontend build:

- CSS: `31.64 kB` (`7.01 kB` gzip)
- JS: `328.81 kB` (`100.26 kB` gzip)

The application uses query-level fetches, an SSE stream for replayable events, and bounded event rendering. The current build is acceptable for the testnet release review. Route-level splitting and chart-only bundle splitting are future optimizations, not Gate 6 blockers; no pathological duplicate request or N+1 frontend loop was observed in the browser audit.

The main runtime limitation is upstream freshness: the current Product oracle observation is stale, which is correctly surfaced rather than hidden behind polling or a synthetic refresh.
