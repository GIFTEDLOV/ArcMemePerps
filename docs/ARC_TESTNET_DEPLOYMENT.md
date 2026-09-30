# Arc Testnet Deployment Plan

This document covers the controlled Arc Testnet Gate 4 deployment. Testnet artifacts are
mechanics evidence only and are not production deployment approval.

The deployment script is `contracts/script/DeployGate4.s.sol`. It deploys the coherent Gate 4 suite, configures the canonical Arc USDC interface, installs a 2-of-3 test reporter set, registers a clearly marked testnet canary market, configures conservative limits, and funds test backing and insurance from the broadcast account. It does not contain private keys.

The broadcast uses dedicated testnet-only public identities and encrypted local keystores outside
the repository. The operator verifies `eth_chainId == 5042002`, the configured USDC address and
decimals, and sufficient testnet USDC for backing, insurance, and Arc gas before every
broadcast-sensitive stage. No mainnet address or key may be reused.

The funded canary configuration uses 5 USDC protocol backing, 2 USDC insurance, 1 USDC maximum
open interest, 0.5 USDC per-side caps, 0.2 USDC maximum position, and 2x leverage. Values are
6-decimal ERC-20 base units onchain. The market identity is a BASE canary identity at
`0x0000000000000000000000000000000000000001`; it is not a production market approval.

The deployment manifest must contain only public data: chain, compiler and optimizer settings, source hashes, constructor arguments, role mapping, addresses, risk rule version, reporter addresses, threshold, market identity, and qualification hash. Private keys and RPC secrets are excluded.

Testnet validates mechanics only. It is not evidence of production approval, decentralized production oracle operation, production liquidity, production solvency, formal audit completion, or governance safety.

## Gate 4B result

The suite was deployed once to Arc Testnet at chain ID `5042002` using the dedicated deployer
`0x69030D355c04734fE31975d1D24313CC27389fCC`. Deployed addresses and transaction hashes are in
`evidence/gate4/deployment-manifest.json` and `evidence/gate4/deployment-transactions.json`.
The final live oracle policy is 120 seconds maximum staleness, 8,500 minimum confidence bps, and
two independent sources. A temporary 600-second window was used only to complete interactive
testnet signing and was restored to 120 seconds before final reconciliation.

ArcScan's Blockscout-compatible source query returned address-only records for every deployed
contract. The contracts are therefore recorded as NOT_VERIFIED; no verification claim is made.
