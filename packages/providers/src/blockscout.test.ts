import { describe, expect, it } from "vitest";
import { BlockscoutEvidenceProvider, compareIndexedBalance } from "./blockscout.js";
import { HttpJsonClient } from "./http.js";

const TOKEN = "0x1111111111111111111111111111111111111111";

function clientFor(handler: (url: URL) => unknown): HttpJsonClient {
  return new HttpJsonClient({
    maxRetries: 0,
    fetchImpl: (input) => {
      const requestUrl =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      const payload = handler(requestUrl);
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });
}

describe("Blockscout indexed evidence", () => {
  it("follows documented holder pagination and records response provenance", async () => {
    const provider = new BlockscoutEvidenceProvider("ETHEREUM", {
      http: clientFor((url) => {
        if (url.searchParams.get("action") === "getToken")
          return { status: "1", message: "OK", result: { totalSupply: "1000", decimals: "0" } };
        const page = Number(url.searchParams.get("page"));
        return {
          status: "1",
          message: "OK",
          result:
            page === 1
              ? [
                  { address: "0x2222222222222222222222222222222222222222", value: "600" },
                  { address: "0x3333333333333333333333333333333333333333", value: "400" },
                ]
              : [{ address: "0x4444444444444444444444444444444444444444", value: "0" }],
        };
      }),
      pageSize: 2,
      minRequestIntervalMs: 0,
    });
    const census = await provider.readTokenHolders(TOKEN, "2026-10-07T00:00:00.000Z");
    expect(census.status).toBe("AVAILABLE");
    expect(census.coverage).toBe("COMPLETE");
    expect(census.pagesFetched).toBe(2);
    expect(census.holders).toHaveLength(3);
    expect(census.holders[0]?.rawResponseHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(census.holders[0]?.page).toBe(1);
  });

  it("marks a capped holder census PARTIAL instead of silently complete", async () => {
    const provider = new BlockscoutEvidenceProvider("BASE", {
      http: clientFor((url) => {
        if (url.searchParams.get("action") === "getToken")
          return { status: "1", message: "OK", result: { totalSupply: "1000", decimals: "0" } };
        return {
          status: "1",
          message: "OK",
          result: [
            { address: "0x2222222222222222222222222222222222222222", value: "600" },
            { address: "0x3333333333333333333333333333333333333333", value: "400" },
          ],
        };
      }),
      pageSize: 2,
      maxPages: 1,
      minRequestIntervalMs: 0,
    });
    const census = await provider.readTokenHolders(TOKEN, "2026-10-07T00:00:00.000Z");
    expect(census.status).toBe("PARTIAL");
    expect(census.coverage).toBe("PARTIAL");
    expect(census.reason).toBe("MAX_HOLDER_PAGES_REACHED");
  });

  it("rejects materially divergent indexed/current balances", () => {
    expect(compareIndexedBalance("100000", "100050")).toBe("CONSISTENT");
    expect(compareIndexedBalance("100000", "120000")).toBe("CONFLICTED");
    expect(compareIndexedBalance("not-a-number", "1")).toBe("CONFLICTED");
  });

  it("validates event address and topic before persisting logs", async () => {
    const topic = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const provider = new BlockscoutEvidenceProvider("ETHEREUM", {
      http: clientFor((url) => ({
        status: "1",
        message: "OK",
        result:
          url.searchParams.get("action") === "getLogs"
            ? [
                {
                  address: TOKEN,
                  transactionHash:
                    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  blockNumber: "10",
                  logIndex: "0",
                  timeStamp: "20",
                  topics: [topic],
                  data: "0x",
                },
                {
                  address: "0x9999999999999999999999999999999999999999",
                  transactionHash:
                    "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                  topics: [topic],
                  data: "0x",
                },
              ]
            : [],
      })),
      minRequestIntervalMs: 0,
    });
    const logs = await provider.readLogs(TOKEN, topic, 1, 10, "2026-10-07T00:00:00.000Z");
    expect(logs.status).toBe("AVAILABLE");
    expect(logs.logs).toHaveLength(1);
    expect(logs.logs[0]?.address).toBe(TOKEN);
  });
});
