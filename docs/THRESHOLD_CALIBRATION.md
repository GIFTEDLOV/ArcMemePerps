# Threshold calibration

The 5% connected-cluster rule remains a development rule, not a universal
truth. Calibration must run against neutral frozen evidence snapshots and must
report qualification, watch, rejection, and insufficient-evidence rates plus
sensitivity to cluster, depth, age, oracle, and liquidity thresholds.

`packages/risk-engine/src/calibration.ts` runs the current frozen corpus and
reports qualification, watch, rejection, insufficient-evidence, hard-gate
frequency, and connected-cluster sensitivity. The current repository has
deterministic synthetic and captured evidence fixtures, but it does not yet
contain a sufficiently diverse, independently reviewed public-market corpus to
claim calibrated production thresholds. No threshold is loosened to increase
qualification rate.
