// Non-broadcast Arc LP release-readiness evaluator. Does not use RPC,
// credentials, an EVM signer or a deployment endpoint.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = resolve(ROOT, "deployments/arc-lp-security-release-plan.template.json");
const SOURCE_PATHS = [
  "contracts/src/PublicLPVault.sol",
  "contracts/src/USDCMarginVault.sol",
  "scripts/arc-mainnet-deployment.ts",
  "scripts/deploy-mainnet-suite.ts",
  "scripts/verify-mainnet-deployment.ts",
];
const KNOWN_USDC = "0x3600000000000000000000000000000000000000";
const OLD_MARGIN = "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf";
const CHECKSUM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function evaluateLpReleasePlan(plan, source = {}, checkout = null) {
  const blockers = [];
  const add = (condition, message) => { if (condition) blockers.push(message); };
  const network = plan.network ?? {};
  const old = plan.existingContracts ?? {};
  const next = plan.replacement ?? {};
  const admin = plan.governance ?? {};
  const release = plan.release ?? {};

  add(plan.schema !== "cluster/arc-lp-security-release-plan/v1", "UNRECOGNIZED_PLAN_SCHEMA");
  add(plan.mode !== "APPROVED", "NOT_AUTHORIZED_FOR_DEPLOYMENT");
  add(network.chainId !== 5042 || String(network.usdc).toLowerCase() !== KNOWN_USDC || network.usdcDecimals !== 6,
    "INVALID_ARC_USDC_CONFIGURATION");
  add(!next.deployFreshMarginVault || !next.deployFreshPublicLpVault ||
    next.reuseExistingMarginVault || !next.requireReciprocalLpLinks,
    "REPLACEMENT_VAULT_TOPOLOGY_UNSAFE");
  add(next.lpWithdrawalCooldownSeconds < 1 || !Number.isInteger(next.lpWithdrawalCooldownSeconds),
    "INVALID_LP_WITHDRAWAL_COOLDOWN");
  add(next.publicLpActivationOnDeployment !== false || next.withdrawalSettlementOnDeployment !== false,
    "AUTO_ACTIVATION_PROHIBITED");
  add(next.migrateExistingTraderCollateral !== false, "TRADER_COLLATERAL_MIGRATION_NOT_AUTHORIZED");
  add(next.engineIntegrationVerified !== true, "TRADER_PNL_TO_LP_NAV_INTEGRATION_UNVERIFIED");
  add(admin.timelockMinimumSeconds < 86400 || !Number.isInteger(admin.timelockMinimumSeconds),
    "GOVERNANCE_TIMELOCK_BELOW_PLAN_MINIMUM");
  for (const role of ["safeAddress", "lpRiskControllerAddress", "emergencyAdminAddress", "deployerAddress"]) {
    add(!CHECKSUM_ADDRESS.test(String(admin[role] ?? "")) || /^0x0+$/.test(String(admin[role] ?? "")),
      "MISSING_VERIFIED_ROLE_" + role);
  }
  add(admin.minimumSafeOwners < 2, "GOVERNANCE_MULTISIG_NOT_CONFIRMED");
  add(!old.publicLpMustBeInactive || !old.publicLpMustHaveZeroShares, "OLD_PUBLIC_LP_UNSAFE_RELEASE_ASSUMPTION");
  add(String(old.marginVault).toLowerCase() !== OLD_MARGIN, "HISTORICAL_MARGIN_VAULT_MISMATCH");
  add(!/^[0-9a-f]{40}$/.test(String(release.approvedCommit ?? "")) ||
      release.approvedCommit !== checkout, "RELEASE_COMMIT_NOT_EXACTLY_APPROVED");
  for (const check of ["sourceReviewApproved", "externalEconomicReviewApproved",
    "liveFundsAndPositionsReconciled", "fullDependencyGraphVerified", "authorizedWalletExecutionApproved"]) {
    add(release[check] !== true, "RELEASE_APPROVAL_MISSING_" + check);
  }

  const deployer = source["scripts/arc-mainnet-deployment.ts"] ?? "";
  const legacyDeployer = source["scripts/deploy-mainnet-suite.ts"] ?? "";
  const vault = source["contracts/src/PublicLPVault.sol"] ?? "";
  const margin = source["contracts/src/USDCMarginVault.sol"] ?? "";
  const verify = source["scripts/verify-mainnet-deployment.ts"] ?? "";
  add(!deployer.includes('await call("USDCMarginVault", "setLpVault"') ||
      !deployer.includes('await call("PublicLPVault", "setMarginVault"') ||
      !deployer.includes('await call("PublicLPVault", "setSettlementEngine"'),
    "DEPLOYMENT_MISSING_TWO_WAY_LP_MARGIN_LINK");
  add(!legacyDeployer.includes("blockUnsafeLegacyMainnetDeployment();"),
    "LEGACY_MAINNET_BROADCASTER_NOT_DISABLED");
  add(!deployer.includes("assertCheckoutMatchesFrozenRelease();"),
    "DEPLOYMENT_RELEASE_CHECKOUT_GUARD_MISSING");
  add(!vault.includes("certifyWithdrawalAccounting()") ||
      !vault.includes("emergencyPauseWithdrawalSettlement()") ||
      !vault.includes("_assertNoEngineExposure()") ||
      !vault.includes("_assertCertifiedMarginState()") ||
      !vault.includes("certifiedMarginStateDigest") ||
      !vault.includes("hasEverOpenedMarketRisk"),
    "LP_WITHDRAWAL_CERTIFICATION_GUARDS_MISSING");
  add(!margin.includes("function lpRecoverable()"), "MARGIN_LP_RECOVERY_INTERFACE_MISSING");
  add(!margin.includes("function seniorLiabilitiesCovered()") ||
      !margin.includes("function settlementStateDigest()"),
    "MARGIN_SOLVENCY_AND_STATE_COMMITMENT_MISSING");
  add(verify.includes('const expectedSourceSha = "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b"'),
    "HISTORICAL_MAINNET_VERIFY_HASH_NOT_REFROZEN");

  return {
    status: blockers.length === 0 ? "ELIGIBLE_FOR_MANUAL_RELEASE_REVIEW" : "NO_GO",
    // Even zero blockers never authorizes broadcast. This script is diagnostic.
    broadcastAuthorized: false,
    mainnetChangesMade: false,
    blockers,
  };
}

export function generatePreflightReport() {
  const plan = JSON.parse(readFileSync(PLAN, "utf8"));
  const sources = Object.fromEntries(SOURCE_PATHS.map(p =>
    [p, readFileSync(resolve(ROOT, p), "utf8")]));
  let checkout = null;
  try {
    checkout = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT, encoding: "utf8",
    }).trim();
  } catch {
    // Missing Git checkout is also a release blocker.
  }
  const result = evaluateLpReleasePlan(plan, sources, checkout);
  const sourceDigests = Object.fromEntries(SOURCE_PATHS.map(p =>
    [p, createHash("sha256").update(sources[p]).digest("hex")]));
  return {
    ...result, chainId: plan.network.chainId, usdc: plan.network.usdc,
    checkoutCommit: checkout, sourceSha256: sourceDigests,
    note: "Diagnostic only. A passing report cannot sign, deploy, or authorize custody migration.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = generatePreflightReport();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--require-go") && report.status !== "ELIGIBLE_FOR_MANUAL_RELEASE_REVIEW") {
    process.exitCode = 1;
  }
}
