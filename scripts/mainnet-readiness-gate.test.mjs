import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReleaseGate } from "./mainnet-readiness-gate.mjs";

const READY = {
  index: { status: "COMPLETE", gaps: 0, singleSourceRanges: 0,
    observedRegisteredMarkets: 1, observedQualificationApprovals: 1 },
  status: { qualificationInventory: "VERIFIED", tradingEnabled: false, lpDepositsEnabled: false },
  governance: {
    PerpEngine: { bootstrapFinalized: true,
      owner: "0x0000000000000000000000000000000000000001",
      governanceExecutor: "0x0000000000000000000000000000000000000002" },
    PublicLPVault: { bootstrapFinalized: true,
      owner: "0x0000000000000000000000000000000000000001",
      governanceExecutor: "0x0000000000000000000000000000000000000002" }
  }
};

test("release gate needs manual review even with all prerequisites", () => {
  const r = assessReleaseGate(structuredClone(READY));
  assert.equal(r.decision, "REVIEW_REQUIRED");
  assert.equal(r.blockers.length, 0);
});
test("unverified markets fail closed without claiming public trading", () => {
  const d = structuredClone(READY);
  d.index.observedRegisteredMarkets = 0;
  d.index.observedQualificationApprovals = 0;
  d.status.qualificationInventory = "UNVERIFIED";
  const r = assessReleaseGate(d);
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("NO_QUALIFIED_MARKET_APPROVALS"));
});
test("unqualified market with trading activated is unsafe", () => {
  const d = structuredClone(READY);
  d.index.observedQualificationApprovals = 0;
  d.status.tradingEnabled = true;
  assert.equal(assessReleaseGate(d).decision, "UNSAFE");
});
test("LP activation with unfinished bootstrap is unsafe", () => {
  const d = structuredClone(READY);
  d.governance.PublicLPVault.bootstrapFinalized = false;
  d.status.lpDepositsEnabled = true;
  assert.equal(assessReleaseGate(d).decision, "UNSAFE");
});
test("unfinished governance remains blocked with deposits off", () => {
  const d = structuredClone(READY);
  d.governance.PerpEngine.governanceExecutor = "0x0000000000000000000000000000000000000000";
  assert.equal(assessReleaseGate(d).decision, "HOLD");
});
test("incomplete or non dual-source index remains blocked", () => {
  const d = structuredClone(READY);
  d.index.status = "INCOMPLETE";
  d.index.singleSourceRanges = 5;
  assert.equal(assessReleaseGate(d).decision, "HOLD");
});
