# Arc Testnet Deployment Plan

This document is a dry-run plan only. Gate 4 has not broadcast a deployment.

The deployment script is `contracts/script/DeployGate4.s.sol`. It deploys the coherent Gate 4 suite, configures the canonical Arc USDC interface, installs a 2-of-3 test reporter set, registers a clearly marked testnet canary market, configures conservative limits, and funds test backing and insurance from the broadcast account. It does not contain private keys.

Before a future broadcast, the operator must provide dedicated testnet-only public identities and an encrypted signer environment, verify `eth_chainId == 5042002`, verify the configured USDC address and decimals, and verify sufficient testnet USDC for backing and insurance. No mainnet address or key may be reused.

The deployment manifest must contain only public data: chain, compiler and optimizer settings, source hashes, constructor arguments, role mapping, addresses, risk rule version, reporter addresses, threshold, market identity, and qualification hash. Private keys and RPC secrets are excluded.

Testnet validates mechanics only. It is not evidence of production approval, decentralized production oracle operation, production liquidity, production solvency, formal audit completion, or governance safety.
