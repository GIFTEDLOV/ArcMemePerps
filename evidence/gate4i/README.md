# Gate 4I evidence

This directory records the clean Product Testnet deployment and its live
backend surface. It does not replace or mutate Gate 4G evidence.

## Deployment identities

- `STRESS_SECURITY_DEPLOYMENT`: Gate 4G deployment in `../gate4g/`. It is
  immutable adversarial evidence. Its terminal `solvencyBlocked=true` state and
  explicit residual bad debt are preserved.
- `PRODUCT_TESTNET_DEPLOYMENT`: the fresh ten-contract V2 suite recorded in
  `product-deployment.json`. It is the frontend/API target and remains healthy
  with `solvencyBlocked=false`, zero bad debt, zero OI, qualified oracle state,
  and active bounded LP liquidity.

All values are testnet observations on Arc chain ID 5042002. No private keys
or secrets are included. SQLite files are local runtime/replay databases and
are intentionally ignored by Git.
