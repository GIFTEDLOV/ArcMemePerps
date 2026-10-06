# Phase 5 canonical PumpSwap qualification lane

This lane is restricted to a token that can be tied to the Pump.fun launch
program, a completed migration, and the canonical PumpSwap pool. A pool is not
canonical merely because a market-data provider labels its DEX `PumpSwap`.

## Versioned policy evidence

The current official sources used by the implementation are:

- [Pump program documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)
- [PumpSwap documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md)
- [PumpSwap IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json)
- [Negative virtual quote reserve documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md)

The source snapshot is recorded in code as
`pump-public-docs@main (verified 2026-10-06)`. The implementation uses the
documented program IDs:

- Pump.fun: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- PumpSwap: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

## Canonical identity

For base mint `M`, derive the Pump pool-authority PDA from
`["pool-authority", M]` under the Pump.fun program. Derive the PumpSwap pool
from `["pool", u16(0), poolAuthority, M, WSOL]` under the PumpSwap program.
The account must be owned by PumpSwap and decode to:

- `index = 0`;
- the derived pool authority as `creator`;
- the candidate mint as `base_mint`;
- WSOL as `quote_mint`;
- the account's declared LP mint and base/quote vaults.

The pool identity is necessary but not sufficient. Graduation is `PROVEN` only
when a bounded canonical transaction read finds a Pump.fun `migrate`
instruction for the pool. A pool account without that transaction remains
`UNKNOWN` for graduation.

## LP-control semantics

The official migration rule that migrated LP tokens are burned is applied only
after the canonical identity and migration transaction are proven. The reader
then corroborates the rule with the LP mint, LP supply, and resolved largest LP
token accounts. A user-created PumpSwap pool is not granted this policy; the
documented `withdraw` path means it remains `UNKNOWN` or
`WITHDRAWABLE_BY_PRIVILEGED_ACTOR` until its own LP-control evidence is closed.

Any contradiction between canonical migration evidence and observed LP state is
`CONFLICTED` and cannot qualify.

## Pool decoding and quote math

Pool decoding follows the official Anchor layout. Older accounts can end before
the appended fields; missing `virtual_quote_reserves`, creator-fee, and holder-
reward fields are interpreted as the documented legacy defaults, not as a
failed read. The virtual reserve is signed `i128`.

The executable quote state is:

```text
effective_quote_reserves = raw quote vault balance + virtual_quote_reserves
```

The direct price and buy/sell depth calculations use the effective quote
reserve, actual base-vault balance, and the live PumpSwap global fee account.
TVL and aggregator headline depth are never substituted for direct depth.

## Activity and holder evidence

Bounded `getSignaturesForAddress` / `getTransaction` reads decode the official
PumpSwap `BuyEvent` and `SellEvent` payloads. Observations are deduplicated by
signature, side, and event amount. Empty or incomplete windows remain
`INSUFFICIENT_DATA` or `UNKNOWN`.

Largest token accounts are resolved with `getMultipleAccounts` and aggregated
by the on-chain token-account owner. Unresolved accounts remain in the
concentration denominator. Only the canonical pool, verified program/system
addresses, and evidenced burn addresses may be excluded, with an evidence ID
for each exclusion.

