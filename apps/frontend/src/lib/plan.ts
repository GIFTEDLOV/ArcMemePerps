export interface ReviewPlan {
  account: string;
  marketId: string;
  side: "LONG" | "SHORT";
  oracleSequence: string | number;
  expiresAt: number;
}

export interface ReviewIntent {
  account: string;
  marketId: string;
  side: "LONG" | "SHORT";
  oracleSequence: string | number;
  now: number;
}

export function isPlanStillValid(plan: ReviewPlan, intent: ReviewIntent): boolean {
  return (
    plan.account.toLowerCase() === intent.account.toLowerCase() &&
    plan.marketId.toLowerCase() === intent.marketId.toLowerCase() &&
    plan.side === intent.side &&
    String(plan.oracleSequence) === String(intent.oracleSequence) &&
    intent.now < plan.expiresAt
  );
}
