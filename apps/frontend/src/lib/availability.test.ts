import { describe, expect, it } from "vitest";
import { LP_DEPOSITS_ENABLED, TRADING_ENABLED } from "./availability";

describe("independent release gates", () => {
  it("keeps trade execution disabled until its release gate is approved", () => {
    expect(TRADING_ENABLED).toBe(false);
  });

  it("keeps LP deposits disabled until their separate release gate is approved", () => {
    expect(LP_DEPOSITS_ENABLED).toBe(false);
  });
});
