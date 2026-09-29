# Arc USDC collateral model

Verified against the current Arc documentation on 2026-09-29:

- Arc mainnet chain ID is `5042`, RPC `https://rpc.mainnet.arc.io`.
- Arc testnet chain ID is `5042002`, RPC `https://rpc.testnet.arc.io`.
- USDC is Arc's native gas asset, with native gas precision of 18 decimals.
- The same native balance exposes an optional ERC-20 USDC interface at
  `0x3600000000000000000000000000000000000000` on both mainnet and testnet.
- The ERC-20 interface reports 6 decimals and supports `approve`, `transferFrom`, and
  `transfer`. The protocol's collateral transport is therefore ERC-20 based; it does not
  use `msg.value` for margin.

The vault stores collateral in ERC-20 USDC base units (`1 USDC = 1_000_000` units). Gas
payment and margin accounting are deliberately separate concerns. Native gas balances use
18-decimal network precision and must never be added to the 6-decimal collateral ledger.

The vault accepts a configured collateral token through an explicit adapter/setter. The
production configuration must verify the configured token's code and `decimals() == 6`
before activation. No mainnet or testnet write is performed in Gate 3.

Sources:

- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Arc network connection details](https://docs.arc.io/arc/references/connect-to-arc)
- [Arc documentation index](https://docs.arc.io/llms.txt)
