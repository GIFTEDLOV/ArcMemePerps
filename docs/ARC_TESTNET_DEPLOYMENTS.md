# Arc Testnet deployment identities

ArcMemePerps now has two intentionally separate V2 deployment identities on
Arc Testnet.

## STRESS_SECURITY_DEPLOYMENT

The Gate 4G suite is immutable security evidence. It records liquidation,
insurance exhaustion, ADL, explicit residual bad debt of `2,099,781` USDC base
units, and terminal `solvencyBlocked=true`. It is not a frontend default and
must not be cleared, repaired in storage, or presented as healthy.

## PRODUCT_TESTNET_DEPLOYMENT

The Gate 4I suite is a fresh deployment of the identical frozen ten-contract
runtime. It is the canonical backend/frontend target: qualified market,
healthy 2-of-3 oracle, active bounded public LP, zero OI at the final check,
zero bad debt, and `solvencyBlocked=false`.

The deployments are isolated by deployment identity, contract addresses, and
indexer checkpoint namespace. Historical Stress evidence remains addressable
for security review and is never mixed into Product projections.
