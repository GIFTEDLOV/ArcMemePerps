# Governance and emergency controls

`AccessControlled` defines explicit governance, risk, emergency, oracle,
qualification, keeper, and insurance roles. Normal configuration paths accept
the bootstrap owner or an explicitly configured `governanceExecutor`, allowing
the `ProtocolTimelock` to be wired without a hidden owner bypass after role
ceremony. `RiskConfig` permits emergency risk reductions and pause/close-only
transitions but rejects emergency risk increases. `ProtocolTimelock` queues
normal configuration calls and consumes the operation before the external
call. Emergency authority never increases leverage, OI, fees, or insurance
withdrawals.

The changed suite exposes `governanceExecutor` hooks for the normal configuration paths and
tests the timelock call boundary. A complete role ceremony is a release-only operation for the
new testnet/mainnet deployment; no mainnet governance is configured or authorized in this gate.
