# Governance and emergency controls

`AccessControlled` defines explicit governance, risk, emergency, oracle, qualification, keeper, and insurance roles. `RiskConfig` permits emergency risk reductions and pause/close-only transitions but rejects emergency risk increases. `ProtocolTimelock` queues normal configuration calls and consumes the operation before the external call.

The current code still needs to wire every production configuration path through the timelock and execute a complete role-ceremony E2E on the changed suite. Mainnet governance is not configured or authorized.
