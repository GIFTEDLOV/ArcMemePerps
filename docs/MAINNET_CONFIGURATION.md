# Arc Mainnet configuration model

Prepared on 2026-10-08 from the current official Arc documentation. This is
a configuration model only. No Mainnet RPC write, deployment, role ceremony,
or funding action was performed.

Primary references:

- [Arc RPC endpoints and network parameters](https://docs.arc.io/arc/references/rpc-endpoints.md)
- [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc.md)
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses.md)
- [Arc gas and fees](https://docs.arc.io/arc/references/gas-and-fees.md)
- [Arc EVM differences](https://docs.arc.io/arc/references/evm-differences.md)

## Network

| Item | Mainnet value | Release rule |
| --- | --- | --- |
| Network name | Arc | Must match the chain ID returned by the configured RPC. |
| Chain ID | `5042` | Any other chain ID is a hard STOP. |
| HTTP RPC | `https://rpc.mainnet.arc.io` | Circle's documented primary endpoint; do not embed credentials. |
| WebSocket RPC | `wss://rpc.mainnet.arc.io` | Use only for the production stream after connectivity checks. |
| Explorer | `https://explorer.arc.io` | Use for receipt and runtime provenance. |
| Native gas symbol | USDC | Arc uses USDC as the native gas asset. |

## USDC representation

Arc has one underlying USDC balance with two relevant representations:

- native gas accounting uses 18 decimal precision;
- the optional ERC-20 interface is at
  `0x3600000000000000000000000000000000000000` and uses 6 decimals for
  application-level allowance, transfer, and custody calls.

The deployment and accounting code must never mix native 18-decimal gas units
with ERC-20 6-decimal margin units. Mainnet preflight must call `decimals()`
and verify the address before any configuration transaction.

## Fee requirements

Transactions use Arc's USDC-denominated EIP-1559 fee market with EWMA
smoothing. The Mainnet runbook must obtain current fee data through
`eth_gasPrice` or `eth_feeHistory` and calculate a bounded `maxFeePerGas`.

Arc's official fee page currently documents a 20 Gwei minimum base fee as a
Testnet parameter. It is not copied into the Mainnet configuration. Mainnet
fee parameters remain runtime-queried and no fixed Mainnet fee value is
guessed here.

## RPC safety

- Page `eth_getLogs` requests within the documented 10,000-block limit.
- Retry the documented load-balanced head race (`-32014`) with bounded
  backoff.
- Keep RPC URLs out of public logs when they contain provider credentials.
- Require chain ID, latest block, USDC code, USDC decimals, and explorer
  identity checks before deployment or indexing.
- Arc's deterministic finality means the indexer does not need an Ethereum-
  style confirmation delay; it still needs durable block checkpoints.

## Configuration boundary

The current application remains Testnet-targeted for historical evidence. A
future Mainnet environment must provide fresh values for:

```text
ARC_MAINNET_RPC_URL
ARC_MAINNET_CHAIN_ID=5042
ARC_MAINNET_USDC_ADDRESS=0x3600000000000000000000000000000000000000
ARC_MAINNET_EXPLORER_URL=https://explorer.arc.io
```

Contract addresses for ArcMemePerps itself are intentionally `TBD` until a
fresh Mainnet deployment is authorized and verified. Testnet addresses must
not be reused.
