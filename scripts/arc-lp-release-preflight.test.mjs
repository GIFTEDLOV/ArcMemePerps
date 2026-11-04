import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateLpReleasePlan, generatePreflightReport } from "./arc-lp-release-preflight.mjs";

const repo = resolve(import.meta.dirname, "..");
const template = JSON.parse(readFileSync(
  resolve(repo, "deployments/arc-lp-security-release-plan.template.json"), "utf8",
));
const source = Object.fromEntries([
  "contracts/src/PublicLPVault.sol",
  "contracts/src/PerpEngine.sol",
  "contracts/src/USDCMarginVault.sol",
  "scripts/arc-mainnet-deployment.ts",
  "scripts/deploy-mainnet-suite.ts",
  "scripts/verify-mainnet-deployment.ts",
].map(p => [p, readFileSync(resolve(repo, p), "utf8")]));
const fakeHead = "a".repeat(40);
const clone = x => JSON.parse(JSON.stringify(x));

test("current template must stay explicitly NO_GO without authorized roles or approvals", () => {
  const result = generatePreflightReport();
  assert.equal(result.status, "NO_GO");
  assert.equal(result.broadcastAuthorized, false);
  assert.equal(result.mainnetChangesMade, false);
  assert.ok(result.blockers.includes("NOT_AUTHORIZED_FOR_DEPLOYMENT"));
  assert.ok(result.blockers.includes("TRADER_PNL_TO_LP_NAV_INTEGRATION_UNVERIFIED"));
  assert.ok(result.blockers.includes("HISTORICAL_MAINNET_VERIFY_HASH_NOT_REFROZEN"));
});

test("reusing the existing margin vault is an unconditional release blocker", () => {
  const plan = clone(template);
  plan.replacement.reuseExistingMarginVault = true;
  plan.replacement.deployFreshMarginVault = false;
  const result = evaluateLpReleasePlan(plan, source, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("REPLACEMENT_VAULT_TOPOLOGY_UNSAFE"));
});

test("missing reciprocal deployment wiring rejects a superficially complete plan", () => {
  const broken = { ...source,
    "scripts/arc-mainnet-deployment.ts": source["scripts/arc-mainnet-deployment.ts"]
      .replace('await call("PublicLPVault", "setMarginVault"', 'await call("PublicLPVault", "omittedLink"'),
  };
  const result = evaluateLpReleasePlan(template, broken, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("DEPLOYMENT_MISSING_TWO_WAY_LP_MARGIN_LINK"));
});

test("approval checkboxes do not bypass unverified PerpEngine accounting", () => {
  const plan = clone(template);
  plan.mode = "APPROVED";
  plan.release.approvedCommit = fakeHead;
  plan.governance.safeAddress = "0x1111111111111111111111111111111111111111";
  plan.governance.lpRiskControllerAddress = "0x2222222222222222222222222222222222222222";
  plan.governance.emergencyAdminAddress = "0x3333333333333333333333333333333333333333";
  plan.governance.deployerAddress = "0x4444444444444444444444444444444444444444";
  for (const key of ["sourceReviewApproved", "externalEconomicReviewApproved",
    "liveFundsAndPositionsReconciled", "fullDependencyGraphVerified",
    "authorizedWalletExecutionApproved"]) plan.release[key] = true;
  const result = evaluateLpReleasePlan(plan, source, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("TRADER_PNL_TO_LP_NAV_INTEGRATION_UNVERIFIED"));
});

test("missing engine settlement epoch is an unconditional release blocker", () => {
  const broken = { ...source,
    "contracts/src/PerpEngine.sol": source["contracts/src/PerpEngine.sol"]
      .replace("uint256 public settlementSequence;", "uint256 public omittedSettlementEpoch;"),
  };
  const result = evaluateLpReleasePlan(template, broken, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("ENGINE_SETTLEMENT_SEQUENCE_GUARD_MISSING"));
});

test("removing onchain outstanding-order proof is a release blocker", () => {
  const broken = { ...source,
    "contracts/src/PerpEngine.sol": source["contracts/src/PerpEngine.sol"]
      .replace("uint256 public pendingOrderCount;", "uint256 public missingPendingOrderCount;"),
  };
  const result = evaluateLpReleasePlan(template, broken, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("UNSETTLED_ORDER_AND_RISK_OFF_GUARDS_MISSING"));
});

test("deployment must start engine risk-off before bootstrap ends", () => {
  const broken = { ...source,
    "scripts/arc-mainnet-deployment.ts": source["scripts/arc-mainnet-deployment.ts"]
      .replace('await call("PerpEngine", "setLpSettlementMode"', 'await call("PerpEngine", "unsafeNoHalt"'),
  };
  const result = evaluateLpReleasePlan(template, broken, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("DEPLOYMENT_MISSING_TWO_WAY_LP_MARGIN_LINK"));
});

test("historical mainnet broadcaster may not be re-enabled", () => {
  const broken = { ...source,
    "scripts/deploy-mainnet-suite.ts": source["scripts/deploy-mainnet-suite.ts"]
      .replace("blockUnsafeLegacyMainnetDeployment();", "// unsafe bypass"),
  };
  const result = evaluateLpReleasePlan(template, broken, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("LEGACY_MAINNET_BROADCASTER_NOT_DISABLED"));
});

test("mainnet auto-activation is always forbidden in the release plan", () => {
  const plan = clone(template);
  plan.replacement.publicLpActivationOnDeployment = true;
  const result = evaluateLpReleasePlan(plan, source, fakeHead);
  assert.equal(result.status, "NO_GO");
  assert.ok(result.blockers.includes("AUTO_ACTIVATION_PROHIBITED"));
});
