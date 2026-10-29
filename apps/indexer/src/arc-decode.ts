import { decodeEventLog, parseAbi, type Abi, type Hex } from "viem";
import { ARC_CONTRACTS, type IndexedLog } from "./arc-history.js";

// Event shapes are transcribed from the deployed-contract source. Unknown topics stay
// in the raw journal and never become a guessed financial projection.
const EVENTS: Abi = parseAbi([
  "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
  "event RoleUpdated(bytes32 indexed role,address indexed account,bool enabled)",
  "event GovernanceExecutorSet(address indexed executor)",
  "event BootstrapFinalized(address indexed formerOwner,address indexed governanceExecutor)",
  "event MarketRegistered(bytes32 indexed marketId,bytes32 indexed originChain,bytes originToken)",
  "event LifecycleUpdated(bytes32 indexed marketId,bytes32 lifecycle)",
  "event MarketStateUpdated(bytes32 indexed marketId,uint8 state)",
  "event QualificationApproved(bytes32 indexed marketId,bytes32 indexed proofHash,bytes32 indexed ruleVersion,uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint64 expiresAt)",
  "event QualificationRevoked(bytes32 indexed marketId,bytes32 indexed proofHash)",
  "event RiskConfigInitialized(bytes32 indexed marketId,(uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint256 maintenanceMarginBps,uint256 liquidationPenaltyBps,uint8 status) config)",
  "event RiskLimitsReduced(bytes32 indexed marketId,(uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint256 maintenanceMarginBps,uint256 liquidationPenaltyBps,uint8 status) config)",
  "event MarketRequalified(bytes32 indexed marketId,bytes32 indexed proofHash,(uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint256 maintenanceMarginBps,uint256 liquidationPenaltyBps,uint8 status) config)",
  "event MarketStatusUpdated(bytes32 indexed marketId,uint8 status)",
  "event ExposureProviderSet(address indexed exposureProvider)",
  "event UpdaterSet(address indexed updater,bool enabled)",
  "event UpdaterAuthorizationChanged(address indexed updater,bool enabled)",
  "event ReporterSet(address indexed reporter,bool enabled)",
  "event ReporterThresholdSet(uint256 threshold,bytes32 indexed version)",
  "event PriceUpdated(bytes32 indexed marketId,uint256 price,uint64 observedAt,uint256 confidenceBps)",
  "event ReportUpdated(bytes32 indexed marketId,uint64 indexed sequence)",
  "event OraclePolicyUpdated(uint64 maxStaleness,uint256 minimumConfidenceBps,uint256 minimumIndependentSources)",
  "event PositionOpened(uint256 indexed positionId,address indexed trader,bytes32 indexed marketId,bool isLong,uint256 collateral,uint256 size,uint256 entryPrice)",
  "event PositionIncreased(uint256 indexed positionId,uint256 collateralAdded,uint256 sizeAdded)",
  "event PositionReduced(uint256 indexed positionId,uint256 collateralReleased,uint256 sizeReduced)",
  "event PositionClosed(uint256 indexed positionId,int256 pnl,uint256 badDebt)",
  "event PositionLiquidated(uint256 indexed positionId,int256 pnl,uint256 badDebt)",
  "event OrderSubmitted(bytes32 indexed orderId,address indexed account,bytes32 indexed marketId,uint256 nonce)",
  "event OrderCancelled(bytes32 indexed orderId,address indexed account)",
  "event OrderExecuted(bytes32 indexed orderId,uint256 executionPrice,uint64 oracleSequence)",
  "event MarketAccrualUpdated(bytes32 indexed marketId,int256 fundingIndexWad,uint256 borrowIndexWad,uint64 timestamp)",
  "event EconomicConfigUpdated()",
  "event SideCapsSet(bytes32 indexed marketId,uint256 maxLong,uint256 maxShort)",
  "event SkewConfigSet(uint256 maxSkewRatioWad,uint256 worseningFeeRateWad)",
  "event SkewFeeCharged(uint256 indexed positionId,uint256 amount)",
  "event BadDebtCoverageApplied(uint256 badDebt,uint256 covered,uint256 uncovered)",
  "event LiquidationOutcome(uint256 indexed positionId,uint256 reward,uint256 residual)",
  "event PartialSettlementOutcome(uint256 indexed positionId,uint256 payout,uint256 badDebt)",
  "event ADLControllerSet(address indexed controller)",
  "event ADLPositionReduced(uint256 indexed positionId,uint256 sizeReduced,uint256 economicReduction,uint256 executionPrice)",
  "event TerminalInsolvencyStateEntered()",
  "event LiquidationKeeperSet(address indexed keeper,bool enabled)",
  "event OrderKeeperSet(address indexed keeper,bool enabled)",
  "event EngineSet(address indexed engine)",
  "event CollateralTokenSet(address indexed token,uint8 decimals)",
  "event CollateralTokenSet(address indexed token)",
  "event AccountingCredit(address indexed trader,uint256 amount)",
  "event ProtocolBackingFunded(uint256 amount)",
  "event CollateralDeposited(address indexed trader,uint256 amount)",
  "event CollateralWithdrawn(address indexed trader,uint256 amount)",
  "event CollateralLocked(address indexed trader,uint256 amount)",
  "event CollateralUnlocked(address indexed trader,uint256 amount)",
  "event PositionSettled(address indexed trader,uint256 collateral,int256 pnl,uint256 badDebt)",
  "event PartialPositionSettled(address indexed trader,uint256 collateral,int256 pnlUsdWad,uint256 fee,uint256 payout)",
  "event AccruedPositionCostSettled(address indexed trader,int256 signedCostUsdWad,uint256 newCollateral,uint256 badDebt)",
  "event LiquidationSettled(address indexed trader,address indexed liquidator,uint256 collateral,int256 pnlUsdWad,uint256 liquidatorReward,uint256 residual,uint256 badDebt)",
  "event FeeAccrued(uint256 amount)",
  "event InsuranceReserveAccrued(uint256 amount)",
  "event PendingPositivePnlUpdated(uint256 amount)",
  "event InsuranceCoverageReceived(uint256 amount)",
  "event ADLResolutionApplied(uint256 amount,uint256 remainingBadDebt)",
  "event CapitalFunded(uint256 amount)",
  "event BadDebtRecorded(uint256 amount,uint256 covered,uint256 uncovered)",
  "event BadDebtRecorded(uint256 amount)",
  "event Deposited(address indexed account,uint256 assets,uint256 shares)",
  "event WithdrawalRequested(address indexed account,uint256 shares,uint64 availableAt)",
  "event Withdrawn(address indexed account,uint256 assets,uint256 shares)",
  "event TraderLiabilityUpdated(uint256 pendingLiability)",
  "event InsuranceAccounted(uint256 amount)",
  "event RiskControllerSet(address indexed controller)",
  "event ManagedAssetsReconciled(uint256 managedAssets,uint256 actualCustody,uint8 status)",
  "event MarketRiskBudgetSet(uint256 riskBudget)",
  "event PublicLPActivationSet(bool active,address indexed actor)",
  "event CandidateRegistered(bytes32 indexed episode,uint256 indexed positionId,uint256 score)",
  "event ADLExecuted(bytes32 indexed episode,uint256 indexed positionId,uint256 sizeReduced,uint256 economicReduction,uint256 remaining)",
  "event ADLFinalized(bytes32 indexed episode)",
  "event ADLTerminalized(bytes32 indexed episode,uint256 unresolvedDeficit)",
  "event KeeperSet(address indexed keeper,bool enabled)",
  "event OperationQueuedEvent(bytes32 indexed operationId,address indexed target,uint64 eta)",
  "event OperationExecuted(bytes32 indexed operationId,address indexed target)",
  "event OperationCancelled(bytes32 indexed operationId)",
]);

const CONTRACT_CATEGORY: Record<string, string> = {
  MarketRegistry: "MARKET",
  QualificationRegistry: "QUALIFICATION",
  RiskConfig: "RISK",
  OracleRouter: "ORACLE",
  PerpEngine: "TRADE",
  USDCMarginVault: "CUSTODY",
  InsuranceFund: "INSURANCE",
  ADLController: "ADL",
  PublicLPVault: "LP",
  ProtocolTimelock: "GOVERNANCE",
};
export interface DecodedArcEvent {
  contractName: string;
  eventName: string;
  category: string;
  marketId: string | null;
  account: string | null;
  positionId: string | null;
  arguments: Record<string, unknown>;
}

export function decodeArcEvent(log: IndexedLog): DecodedArcEvent | null {
  const match = Object.entries(ARC_CONTRACTS).find(
    ([, [address]]) => address.toLowerCase() === log.address.toLowerCase(),
  );
  if (!match) return null;
  try {
    const decoded = decodeEventLog({
      abi: EVENTS,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
      strict: true,
    });
    if (!decoded.eventName) return null;
    const args = JSON.parse(
      JSON.stringify(decoded.args, (_, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ) as Record<string, unknown>;
    const stringArg = (key: string) =>
      typeof args[key] === "string" ? (args[key] as string) : null;
    return {
      contractName: match[0],
      eventName: decoded.eventName,
      category: CONTRACT_CATEGORY[match[0]] ?? "UNKNOWN",
      marketId: stringArg("marketId"),
      account: stringArg("account") ?? stringArg("trader"),
      positionId: stringArg("positionId"),
      arguments: args,
    };
  } catch {
    return null;
  }
}
