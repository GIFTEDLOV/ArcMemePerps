# CLUSTER existing-LP → MarginVault backing bridge (source candidate)

This candidate connects **only** the existing `PublicLPVault` to the existing `USDCMarginVault` using a fixed, asset-matched address set by governance. No new pool, custody destination, UI redesign, public deployment, or Mainnet financial activation is included.

## Accounting

- `PublicLPVault.managedAssets` tracks **local USDC custody only**. `allocatedBacking` tracks nominal principal moved to MarginVault, never counted as local custody.
- `USDCMarginVault.lpBacking` tracks that same LP principal separately from `protocolBacking` and trader collateral. Incoming transfers must exactly match physical custody delta in one transaction; donations do not become LP funds.
- LP NAV = local managed cash + **only recoverable** allocated margin residual, minus LP-local obligations. The margin residual excludes senior trader claims, positive PnL, uncovered debt, protocol-owned backing and insurance reserve, and can never exceed recorded LP principal. No double counting of sent USDC.
- Recovery is only to the fixed original share issuer and cannot exceed the currently recoverable residual. Margin losses must be explicitly written down in both ledgers before a new share series can start.
- The entire transfer or write-off reverts atomically on any mismatch.

## Safety prerequisites / not yet implemented

This is **not** production-ready financial integration. It requires an independent security/economic audit, source-to-runtime parity, up-to-date full Foundry invariants, proof that fee splits include real cash rather than annotations, review of ADL and reserve accounting, migration of existing Product Testnet shareholder claims, a new audited deployment and secure multisig/governance bootstrap, and a correctly qualified oracle market. The currently deployed Mainnet and Product Testnet contracts do not gain these functions just because the repository source changes.

The existing Mainnet PublicLPVault has zero reported shares and capital at the earlier checkpoint, but that snapshot must be refreshed before considering migration. The Product Testnet vault has real shareholder balances; they must not be abandoned or silently rewritten. No developer or automated CI workflow may broadcast allocation, withdrawal, write-off, or migration transactions.

All public trading and LP deposit gates remain disabled until independent authorization.
