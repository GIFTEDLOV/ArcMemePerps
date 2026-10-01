import { describe, expect, it } from "vitest";
import { ProviderPool } from "./pool.js";

describe("provider pool", () => {
  it("fails over with bounded attempts and reports degradation", async () => {
    const pool = new ProviderPool<string>(
      [
        { id: "primary", priority: 1, read: () => Promise.reject(new Error("429")) },
        { id: "secondary", priority: 2, read: () => Promise.resolve("canonical") },
      ],
      { maxAttempts: 2, sleep: () => Promise.resolve() },
    );
    const result = await pool.read();
    expect(result.status).toBe("DEGRADED");
    expect(result.value).toBe("canonical");
    expect(result.attempted).toEqual(["primary", "secondary"]);
  });

  it("does not turn provider failure into zero or a fabricated value", async () => {
    const pool = new ProviderPool<number>(
      [{ id: "only", priority: 1, read: () => Promise.reject(new Error("down")) }],
      { sleep: () => Promise.resolve() },
    );
    const result = await pool.read();
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.value).toBeNull();
  });

  it("retains circuit state while allowing request-specific context", async () => {
    const contexts: string[] = [];
    const pool = new ProviderPool<string, { readonly token: string }>(
      [
        {
          id: "primary",
          priority: 1,
          read: (context) => {
            contexts.push(context.token);
            return Promise.reject(new Error("down"));
          },
        },
      ],
      { failureThreshold: 1, cooldownMs: 60_000, sleep: () => Promise.resolve() },
    );
    expect((await pool.read({ token: "first" })).status).toBe("UNAVAILABLE");
    expect((await pool.read({ token: "second" })).attempted).toEqual([]);
    expect(contexts).toEqual(["first"]);
  });
});
