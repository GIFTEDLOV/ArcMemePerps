import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import api from "../api/index.js";
import { readIndexedWalletActivity, readIndexedWalletPositions } from "../api/arc-index-read.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const databaseCalls: Array<{sql: string; params: unknown[]}> = [];
const fakeDatabase = {
  async query(sql: string, params: unknown[]) {
    databaseCalls.push({ sql, params });
    return { rows: [] };
  },
} as unknown as Pool;

describe("Arc wallet account index", () => {
  it("rejects invalid account selectors before performing any indexed lookup", async () => {
    const response = await api.fetch(new Request("https://api.cluster.example/api/v1/wallet/not-a-wallet"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_ARC_ADDRESS" });
  });

  it("fails closed when there is no configured persistent index", async () => {
    const previous = process.env.ARC_INDEX_DATABASE_URL;
    delete process.env.ARC_INDEX_DATABASE_URL;
    try {
      const response = await api.fetch(new Request(`https://api.cluster.example/api/v1/wallet/${ADDRESS}`));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "PERSISTENT_INDEX_UNAVAILABLE" });
    } finally {
      if (previous === undefined) delete process.env.ARC_INDEX_DATABASE_URL;
      else process.env.ARC_INDEX_DATABASE_URL = previous;
    }
  });

  it("scopes decoded position and receipt queries to the exact requested account", async () => {
    databaseCalls.length = 0;
    await readIndexedWalletPositions(ADDRESS, 999, fakeDatabase);
    await readIndexedWalletActivity(ADDRESS, 999, fakeDatabase);
    expect(databaseCalls).toHaveLength(2);
    expect(databaseCalls[0]?.params).toEqual([ADDRESS, 100]);
    expect(databaseCalls[0]?.sql).toContain("opening_arguments->>'trader'");
    expect(databaseCalls[1]?.params).toEqual([5042, ADDRESS, 100]);
    expect(databaseCalls[1]?.sql).toContain("lower(d.account)=lower($2)");
  });

  it("refuses malformed account keys even with an available database", async () => {
    await expect(readIndexedWalletPositions("0xBAD", 1, fakeDatabase))
      .rejects.toThrow("INVALID_ARC_ADDRESS");
    await expect(readIndexedWalletActivity("0xBAD", 1, fakeDatabase))
      .rejects.toThrow("INVALID_ARC_ADDRESS");
  });
});
