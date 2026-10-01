import type { LiquiditySecurityStatus } from "./index.js";

export interface V2LpControlInput {
  readonly venue: string;
  readonly lpTokenSupply: bigint | null;
  readonly burnedLpTokens: bigint | null;
  readonly holderAddress: string | null;
  readonly locker: string | null;
  readonly unlockAt: string | null;
  readonly now: string;
  readonly evidenceIds: readonly string[];
}

export interface V3PositionControlInput {
  readonly venue: string;
  readonly positionNftId: string;
  readonly nftOwner: string | null;
  readonly liquidity: bigint | null;
  readonly locker: string | null;
  readonly unlockAt: string | null;
  readonly now: string;
  readonly evidenceIds: readonly string[];
}

export interface SolanaLiquidityControlInput {
  readonly venue: string;
  readonly protocolOwned: boolean | null;
  readonly controller: string | null;
  readonly withdrawable: boolean | null;
  readonly evidenceIds: readonly string[];
}

export interface LiquidityControlResult {
  readonly venue: string;
  readonly model: "V2_LP_TOKEN" | "V3_POSITION_NFT" | "SOLANA_PROTOCOL" | "SOLANA_AMM";
  readonly status: LiquiditySecurityStatus;
  readonly controller: string | null;
  readonly unlockAt: string | null;
  readonly evidenceIds: readonly string[];
  readonly reasonCodes: readonly string[];
}

export function analyzeV2LpControl(input: V2LpControlInput): LiquidityControlResult {
  if (input.evidenceIds.length === 0)
    return unknown(input.venue, "V2_LP_TOKEN", ["LP_CONTROL_EVIDENCE_MISSING"]);
  if (input.lpTokenSupply === null || input.burnedLpTokens === null)
    return unknown(input.venue, "V2_LP_TOKEN", ["LP_SUPPLY_OR_BURN_DATA_MISSING"]);
  if (input.lpTokenSupply === 0n || input.burnedLpTokens === input.lpTokenSupply)
    return result(input.venue, "V2_LP_TOKEN", "BURNED", null, null, input.evidenceIds, [
      "LP_BURN_PROVEN",
    ]);
  if (input.locker !== null && input.unlockAt !== null) {
    const unlock = Date.parse(input.unlockAt);
    const now = Date.parse(input.now);
    if (Number.isFinite(unlock) && Number.isFinite(now) && unlock > now)
      return result(
        input.venue,
        "V2_LP_TOKEN",
        "LOCKED",
        input.locker,
        input.unlockAt,
        input.evidenceIds,
        ["LP_LOCK_PROVEN"],
      );
  }
  return result(
    input.venue,
    "V2_LP_TOKEN",
    "WITHDRAWABLE",
    input.holderAddress,
    input.unlockAt,
    input.evidenceIds,
    ["LP_CONTROLLER_CAN_WITHDRAW"],
  );
}

export function analyzeV3PositionControl(input: V3PositionControlInput): LiquidityControlResult {
  if (input.evidenceIds.length === 0 || input.liquidity === null || input.nftOwner === null)
    return unknown(input.venue, "V3_POSITION_NFT", ["POSITION_NFT_CONTROL_EVIDENCE_MISSING"]);
  if (input.liquidity === 0n)
    return unknown(input.venue, "V3_POSITION_NFT", ["POSITION_LIQUIDITY_ZERO"]);
  if (
    input.locker !== null &&
    input.unlockAt !== null &&
    Date.parse(input.unlockAt) > Date.parse(input.now)
  )
    return result(
      input.venue,
      "V3_POSITION_NFT",
      "LOCKED",
      input.locker,
      input.unlockAt,
      input.evidenceIds,
      ["POSITION_NFT_LOCK_PROVEN"],
    );
  return result(
    input.venue,
    "V3_POSITION_NFT",
    "WITHDRAWABLE",
    input.nftOwner,
    input.unlockAt,
    input.evidenceIds,
    ["POSITION_NFT_OWNER_CAN_WITHDRAW"],
  );
}

export function analyzeSolanaLiquidityControl(
  input: SolanaLiquidityControlInput,
): LiquidityControlResult {
  if (input.evidenceIds.length === 0)
    return unknown(input.venue, input.protocolOwned === true ? "SOLANA_PROTOCOL" : "SOLANA_AMM", [
      "SOLANA_LIQUIDITY_EVIDENCE_MISSING",
    ]);
  if (input.protocolOwned === true)
    return result(
      input.venue,
      "SOLANA_PROTOCOL",
      "PROTOCOL_CONTROLLED",
      input.controller,
      null,
      input.evidenceIds,
      ["PROTOCOL_CONTROLLED_LIQUIDITY"],
    );
  if (input.withdrawable === true)
    return result(
      input.venue,
      "SOLANA_AMM",
      "WITHDRAWABLE",
      input.controller,
      null,
      input.evidenceIds,
      ["AMM_CONTROLLER_CAN_WITHDRAW"],
    );
  return unknown(input.venue, "SOLANA_AMM", ["SOLANA_CONTROL_NOT_PROVEN"]);
}

function unknown(
  venue: string,
  model: LiquidityControlResult["model"],
  reasonCodes: readonly string[],
): LiquidityControlResult {
  return result(venue, model, "UNKNOWN", null, null, [], reasonCodes);
}

function result(
  venue: string,
  model: LiquidityControlResult["model"],
  status: LiquiditySecurityStatus,
  controller: string | null,
  unlockAt: string | null,
  evidenceIds: readonly string[],
  reasonCodes: readonly string[],
): LiquidityControlResult {
  return { venue, model, status, controller, unlockAt, evidenceIds, reasonCodes };
}
