# Gate 4H live backend projection closure

Gate 4H was not executed past read-only validation because the canonical Gate 4G deployment is in a deployment-wide terminal insolvency state. The frozen `PerpEngine` exposes one global `solvencyBlocked` flag, set by `enterTerminalInsolvencyState()`, and provides no reset or per-market override. The live V2 deployment reads `solvencyBlocked=true`; therefore a new market on the same suite cannot truthfully satisfy the required healthy-demo condition `solvencyBlocked=false`.

Clearing or hiding the flag would require a contract change, redeployment, or administrative state manipulation, all forbidden for Gate 4H. The Gate 4G stress market and its residual bad debt were not changed.

The current repository also has no existing production-shaped V2 indexer bootstrap/start command or live API wiring. The API is a read-only developer boundary and the indexer package has no runtime script. Implementing that missing live projection architecture would exceed the instruction not to add new product architecture.

Read-only checks and evidence were persisted. No Gate 4H Arc write, redeployment, mainnet write, frontend start, secret output, remote creation, or GitHub push occurred.
