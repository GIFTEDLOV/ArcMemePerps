import { describe, expect, it } from "vitest";
import { FRONTEND_CONTRACT } from "./schema";

describe("frozen frontend contract", () => {
  it("uses the Gate 4I read-only API and signing boundary", () => {
    expect(FRONTEND_CONTRACT.apiVersion).toBe("v1");
    expect(FRONTEND_CONTRACT.transport.readOnly).toBe(true);
    expect(FRONTEND_CONTRACT.signingBoundary.backendSigns).toBe(false);
    expect(FRONTEND_CONTRACT.signingBoundary.userWalletSigns).toBe(true);
  });
});
