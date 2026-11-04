# Security policy

CLUSTER (formerly ArcMemePerps) includes historical testnet contracts and
documented Arc mainnet deployments. Deployment records do not establish that
mainnet contracts are audited or safe. Do not send funds to any contract or URL
without independently verifying live deployment state and security controls.
See docs/LP_WITHDRAWAL_SECURITY_REMEDIATION.md for a pending security candidate;
source changes alone do not protect already deployed immutable contracts.

Please report security issues privately to the repository maintainers before
opening a public issue. Include the affected component, a minimal
reproduction, impact, and whether the issue affects the frozen contracts,
indexer/API, wallet flow, or frontend.

Never include private keys, seed phrases, reporter material, keeper material,
provider tokens, or database credentials in a report or commit.

The Product Testnet and Stress/Security deployments are intentionally
separate. The Stress/Security deployment is terminally insolvent by design
and must not be used for trading or recovery experiments.
