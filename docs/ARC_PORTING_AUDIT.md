# Arc Porting Audit

Gate 4 audit scope: Arc Testnet and the Arc Foundry local runtime. The authoritative references are the [Arc contract-address documentation](https://docs.arc.io/arc/references/contract-addresses), [Arc connection documentation](https://docs.arc.io/arc/references/connect-to-arc), the [Arc event-indexing guidance](https://docs.arc.io/integrate/infrastructure/indexing-events), and the official [Circle Arc Foundry repository](https://github.com/circlefin/arc-foundry).

## Verified runtime facts

- Arc mainnet chain ID is `5042`.
- Arc Testnet chain ID is `5042002`.
- The canonical USDC interface is `0x3600000000000000000000000000000000000000`.
- The ERC-20-compatible USDC interface exposes 6 decimals.
- Native USDC precision is 18 decimals, while this application accepts only the ERC-20 USDC interface at its custody boundary.
- Arc sub-second blocks may share a `block.timestamp`; block number and log index are required for event ordering.

## Contract audit

The Gate 4 collateral path uses only `IERC20(USDC).transfer`, `transferFrom`, and `balanceOf`. It does not accept `msg.value`, does not use `address(this).balance` for collateral accounting, and does not infer custody from external Transfer-log totals. Native USDC dust below the ERC-20 6-decimal boundary cannot create trader credit.

No protocol economic path relies on `SELFDESTRUCT`, `PREVRANDAO`, beacon roots, or gas-price assumptions. Timestamps are used only for bounded oracle validity, order expiry, qualification expiry, and funding/borrow elapsed time. Equal timestamps are valid and produce zero elapsed-time accrual; timestamp equality is never used as an ordering primitive.

The deployment script does not contain a private key. It requires the caller to provide a broadcast signer and is intended for an explicitly configured local or Arc Testnet invocation only.

## Remaining runtime assumptions

- Arc Testnet’s current fee requirements and endpoint availability must be rechecked immediately before any future broadcast.
- Token transfer rejection/blocklist behavior is represented by the failing-token test double and must be confirmed against the configured testnet USDC interface before a canary.
- This audit validates execution semantics; it is not a security audit or a production-solvency claim.
