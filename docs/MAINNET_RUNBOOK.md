# ArcMemePerps Mainnet deployment runbook

This runbook is prepared but was not executed in Phase 12. It assumes a fresh
deployment of the exact frozen contract source and an already-reviewed role
plan. Any STOP condition ends the ceremony without continuing.

## Ordered procedure

1. **Preflight freeze**
   - Confirm the approved commit and `risk-rules/0.4.0` hash.
   - Recompute the contract source SHA and require the frozen value.
   - Run TypeScript, frontend, Forge, hostile, and release-candidate tests.
   - Confirm no Mainnet or Testnet write is pending from an earlier command.
2. **Network and funding checks**
   - Query the official Mainnet RPC and require `eth_chainId = 5042`.
   - Verify explorer identity, latest block, USDC code, ERC-20 `decimals() = 6`,
     and native-gas semantics.
   - Fund only the deployer and ceremony signers with bounded USDC sufficient
     for deployment and gas. Native gas accounting is 18-decimal USDC.
   - STOP on wrong chain, wrong USDC, unexpected code, or insufficient funds.
3. **Role checks**
   - Verify the public addresses against `MAINNET_ROLE_PLAN.md`.
   - Confirm deployer, governance/timelock, qualification, risk, reporters,
     keeper, emergency, insurance, LP, and treasury identities are distinct as
     required.
   - STOP on signer overlap that violates least privilege or any secret leak.
4. **Fresh deployment**
   - Deploy the frozen contracts with Arc Foundry to Mainnet.
   - Never reuse Testnet addresses, Product canary state, or Stress/Security
     addresses.
   - Keep broadcast files sanitized and outside public artifacts when they
     contain sensitive operational metadata.
5. **Receipt and bytecode verification**
   - Verify every receipt, contract address, creation block, and runtime code.
   - Recompute deployed runtime parity against the frozen build artifacts.
   - STOP on any failed receipt, address collision, bytecode mismatch, or
     source-hash mismatch.
6. **Initial configuration**
   - Configure USDC, vault, insurance, oracle, risk, LP, and ADL references
     through the intended bootstrap path.
   - Install the three reporter addresses and 2-of-3 threshold.
   - Configure timelock and emergency authority before finalization.
7. **Zero-market assertions**
   - Assert registered real markets = `0`.
   - Assert live real markets = `0`.
   - Assert OI = `0`, positions = `0`, bad debt = `0`, and
     `solvencyBlocked = false`.
   - Assert unregistered, unqualified, missing-oracle, stale-oracle, invalid
     sequence, and wrong-market orders fail without custody mutation.
   - STOP if any market or exposure exists.
8. **Role transfer and finalization**
   - Transfer normal configuration authority to the timelock/governance plan.
   - Remove deployer runtime roles and call bootstrap finalization.
   - Re-read every role and governance executor after finalization.
9. **Backend configuration**
   - Configure only Mainnet RPC, fresh Mainnet contract addresses, chain ID,
     and USDC address.
   - Configure API/indexer persistence, CORS, health, replay checkpoints, and
     secret mounts.
   - Keep reporter and keeper workers inert until an actual market is
     qualified and activated through the policy procedure.
10. **Indexer/API startup**
    - Start the indexer from the deployment block with durable checkpoints.
    - Start the read-only API and SSE stream.
    - Verify restart recovery, pagination, replay, dedupe, and outage states.
11. **Frontend target**
    - Point the frontend at the reviewed Mainnet read API only after zero-market
      assertions pass.
    - Verify the UI says 262 observed origin markets only if that snapshot is
      current, and says 0 activated perps until the registry proves otherwise.
12. **Production smoke**
    - Run read-only landing, discovery, search, token detail, Risk Passport,
      proof, portfolio, and activity checks.
    - Run fail-closed order attacks against the empty registry.
    - No user-funded trade occurs in the zero-market genesis state.
13. **Post-deploy provenance**
    - Persist chain ID, RPC identity, deployment receipts, runtime hashes,
      role events, timelock operations, configuration hashes, and zero-state
      assertions.
    - Publish only sanitized public provenance.

## Permanent STOP conditions

Wrong chain, wrong USDC representation, non-frozen bytecode, any Testnet
address reuse, role overlap, missing timelock, nonzero genesis market/OI,
unexpected solvency state, secret exposure, failed receipt, failed runtime
parity, or any order that mutates state before qualification/oracle checks.
