import type { HealthComponent, HealthRecord, HealthState } from "@arcmemeperps/shared";

export class HealthRegistry {
  private readonly records = new Map<HealthComponent, HealthRecord>();

  public update(
    component: HealthComponent,
    input: Omit<HealthRecord, "component" | "state"> & { readonly state: HealthState },
  ): void {
    this.records.set(component, { component, ...input });
  }

  public get(component: HealthComponent): HealthRecord | null {
    return this.records.get(component) ?? null;
  }

  public list(): readonly HealthRecord[] {
    return [...this.records.values()].sort((left, right) =>
      left.component.localeCompare(right.component),
    );
  }

  public overall(): HealthState {
    const states = this.list().map((record) => record.state);
    if (states.includes("CRITICAL")) return "CRITICAL";
    if (states.includes("UNAVAILABLE")) return "UNAVAILABLE";
    if (states.includes("STALE")) return "STALE";
    if (states.includes("DEGRADED")) return "DEGRADED";
    return "OPERATIONAL";
  }
}
