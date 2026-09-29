import type { LifecycleStatus, MarketObservation } from "@arcmemeperps/domain";

const ALLOWED_NEXT: Readonly<Record<LifecycleStatus, readonly LifecycleStatus[]>> = {
  DISCOVERED: ["PRIMARY_MARKET", "BONDING", "DEX_LIVE"],
  PRIMARY_MARKET: ["BONDING", "GRADUATED", "DEX_LIVE"],
  BONDING: ["GRADUATED"],
  GRADUATED: ["DEX_LIVE"],
  DEX_LIVE: ["ESTABLISHED"],
  ESTABLISHED: [],
};

export interface LifecycleTransition {
  readonly from: LifecycleStatus;
  readonly to: LifecycleStatus;
  readonly reason: string;
  readonly observedAt: string;
}

export function canTransitionLifecycle(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return ALLOWED_NEXT[from].includes(to);
}

export function assertLifecycleTransition(from: LifecycleStatus, to: LifecycleStatus): void {
  if (from === to) {
    return;
  }
  if (!canTransitionLifecycle(from, to)) {
    throw new Error(`invalid lifecycle transition: ${from} -> ${to}`);
  }
}

export function lifecyclePathForPlatform(
  originPlatform: MarketObservation["token"]["originPlatform"],
): readonly LifecycleStatus[] {
  if (originPlatform === "PUMP_STYLE" || originPlatform === "RAYDIUM_STYLE") {
    return ["DISCOVERED", "BONDING", "GRADUATED", "DEX_LIVE", "ESTABLISHED"];
  }
  return ["DISCOVERED", "DEX_LIVE", "ESTABLISHED"];
}

export class LifecycleEngine {
  public validateObservation(observation: MarketObservation): LifecycleStatus {
    const path = lifecyclePathForPlatform(observation.token.originPlatform);
    if (!path.includes(observation.lifecycle.status)) {
      throw new Error(
        `lifecycle ${observation.lifecycle.status} is not supported by ${observation.token.originPlatform}`,
      );
    }
    return observation.lifecycle.status;
  }

  public transition(
    from: LifecycleStatus,
    to: LifecycleStatus,
    observedAt: string,
    reason: string,
  ): LifecycleTransition {
    assertLifecycleTransition(from, to);
    return { from, to, observedAt, reason };
  }
}
