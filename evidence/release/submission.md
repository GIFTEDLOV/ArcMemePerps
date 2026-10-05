# ArcMemePerps v1.0.0

Risk-gated multichain meme-asset perpetuals settled on Arc USDC.

## Public links

- App: https://arcmemeperps.vercel.app
- API/SSE: https://api-production-0eb6.up.railway.app/api/v1
- Repository: https://github.com/GIFTEDLOV/ArcMemePerps

## Problem

Meme markets are fast to discover and difficult to evaluate. Perpetuals add
leverage before users can see whether liquidity, ownership, oracle evidence,
or market state are trustworthy.

## Solution

ArcMemePerps connects multichain discovery to an explicit Qualification Gate,
a canonical Risk Passport, and an immutable Execution Gate. Users can inspect
provenance, capacity, oracle freshness, LP control, and lifecycle state before
reviewing and signing a bounded Arc USDC perpetual order.

## Why Arc

Arc Testnet provides the live settlement environment for the product testnet,
including the canonical USDC interface, governed roles, 2-of-3 reporter
oracle, keeper progression, public LP vault, insurance, and explicit bad-debt
controls.

## Architecture

The public frontend is a Vite/React application on Vercel. A durable Railway
service hosts the Product-scoped indexer, SQLite projections on a mounted
volume, read-only HTTP API, SSE stream, oracle publisher, and keeper. The
frontend receives only public configuration; reporter and keeper secrets stay
in Railway sealed variables.

## Safety evidence

The healthy Product Testnet deployment and the destructive Stress/Security
deployment use the same frozen contract source. Product state is
`solvencyBlocked=false` with zero bad debt. Stress state intentionally records
liquidation, insurance, ADL, and terminal insolvency with explicit residual
bad debt; it is preserved as evidence and is never the normal frontend target.

Contract source SHA:
`0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`

ArcScan source verification remains unavailable where the explorer returns
address-only records. Runtime bytecode parity and the local verification
package remain authoritative provenance.

## Product surfaces

Market discovery, Risk Passport, qualification proof, immutable trade review,
wallet-safe signing boundaries, portfolio, activity, public LP accounting,
wallet profiles, canonical competitions, notifications, Needs Attention,
realtime status, and deployment proof are live against the Product Testnet
backend. No synthetic market data, balances, PnL, charts, or leaderboard rows
are used.

## Release qualification

The release includes deterministic TypeScript/frontend tests, Forge contract
tests, production frontend build, public API/SSE smoke, live oracle cycles,
Product/Stress namespace isolation, browser desktop/mobile smoke, and
reproducible CI. No Arc Mainnet writes were performed.
