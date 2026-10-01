# Backend operations

SQLite is the deterministic local store. `PostgresPersistence` provides a portable parameterized JSONB adapter without bundling a paid service or driver. `PersistentJobQueue` stores bounded-attempt jobs and dedupe keys. Provider pools expose retry, priority, and failure boundaries. Indexer checkpoints bind chain progress to hashes/slots and protocol event IDs are idempotent.

Operational completeness still requires deploying supervisors, metrics collection, long-lived keeper/reporter processes, and durable production checkpoint wiring. Health states are explicit: operational, degraded, stale, unavailable, and critical.
