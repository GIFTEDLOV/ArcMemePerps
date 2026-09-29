import { describe, expect, it } from "vitest";
import { NETWORK_CONFIGS } from "@arcmemeperps/shared";
import { BubblemapsProvider } from "./bubblemaps.js";
import { DexScreenerProvider } from "./dexscreener.js";
import { freshnessFor } from "./evidence.js";
import { GoPlusProvider } from "./goplus.js";
import { HttpJsonClient } from "./http.js";
import { SolanaRpcProvider } from "./solana-rpc.js";
import { reconcileNumeric } from "./reconciliation.js";

const fetchedAt = "2026-09-29T00:00:00.000Z";

function fakeFetch(payload: unknown, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

describe("provider boundaries", () => {
  it("distinguishes stale, future, and missing source timestamps", () => {
    expect(freshnessFor("2026-09-28T00:00:00.000Z", fetchedAt, 60_000)).toBe("STALE");
    expect(freshnessFor("2026-09-29T01:00:00.000Z", fetchedAt)).toBe("FUTURE_TIMESTAMP");
    expect(freshnessFor(null, fetchedAt)).toBe("UNAVAILABLE");
  });

  it("aggregates duplicate and multi-venue DexScreener pools without choosing the first blindly", async () => {
    const provider = new DexScreenerProvider(
      NETWORK_CONFIGS.BASE,
      new HttpJsonClient({
        fetchImpl: fakeFetch([
          pair("0xpool-a", "uniswap", 800_000),
          pair("0xpool-a", "uniswap", 800_000),
          pair("0xpool-b", "aerodrome", 200_000),
        ]),
      }),
    );
    const result = await provider.readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(result.status).toBe("AVAILABLE");
    expect(result.value?.pairs).toHaveLength(2);
    expect(result.value?.totalObservedLiquidityUsd).toBe(1_000_000);
    expect(result.value?.dominantPool?.pairAddress).toBe("0xpool-a");
    expect(result.value?.poolConcentrationPct).toBe(80);
    expect(result.value?.depth1PctUsd).toBeNull();
  });

  it("rejects a provider response for the wrong chain", async () => {
    const provider = new DexScreenerProvider(
      NETWORK_CONFIGS.BASE,
      new HttpJsonClient({ fetchImpl: fakeFetch([pair("0xpool-a", "uniswap", 1, "ethereum")]) }),
    );
    const result = await provider.readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(result.status).toBe("ERROR");
    expect(result.error).toContain("wrong chain");
  });

  it("keeps zero-liquidity and no-pair responses explicit", async () => {
    const zeroProvider = new DexScreenerProvider(
      NETWORK_CONFIGS.BASE,
      new HttpJsonClient({ fetchImpl: fakeFetch([pair("0xpool-zero", "uniswap", 0)]) }),
    );
    const zero = await zeroProvider.readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(zero.status).toBe("AVAILABLE");
    expect(zero.value?.totalObservedLiquidityUsd).toBe(0);
    const emptyProvider = new DexScreenerProvider(
      NETWORK_CONFIGS.BASE,
      new HttpJsonClient({ fetchImpl: fakeFetch([]) }),
    );
    const empty = await emptyProvider.readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(empty.status).toBe("AVAILABLE");
    expect(empty.value?.pairs).toHaveLength(0);
    expect(empty.value?.depth1PctUsd).toBeNull();
  });

  it("rejects impossible negative normalized values", async () => {
    const provider = new DexScreenerProvider(
      NETWORK_CONFIGS.BASE,
      new HttpJsonClient({ fetchImpl: fakeFetch([pair("0xpool-negative", "uniswap", -1)]) }),
    );
    const result = await provider.readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(result.status).toBe("ERROR");
    expect(result.error).toContain("invalid");
  });

  it("keeps optional security and cluster evidence unavailable without credentials", async () => {
    const goPlus = await new GoPlusProvider(NETWORK_CONFIGS.BASE).readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    const bubbles = await new BubblemapsProvider(NETWORK_CONFIGS.BASE).readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(goPlus.reason).toBe("GOPLUS_API_KEY_MISSING");
    expect(bubbles.reason).toBe("BUBBLEMAPS_API_KEY_MISSING");
    expect(goPlus.value).toBeNull();
    expect(bubbles.value).toBeNull();
  });

  it("rejects a GoPlus response keyed to a different token", async () => {
    const provider = new GoPlusProvider(NETWORK_CONFIGS.BASE, {
      apiKey: "test-only",
      client: new HttpJsonClient({
        fetchImpl: fakeFetch({
          code: 1,
          result: { "0x0000000000000000000000000000000000000002": { is_open_source: "1" } },
        }),
      }),
    });
    const result = await provider.readToken(
      "0x0000000000000000000000000000000000000001",
      fetchedAt,
    );
    expect(result.status).toBe("ERROR");
    expect(result.error).toContain("does not match");
  });

  it("preserves unknown GoPlus security fields instead of inventing safe values", async () => {
    const tokenAddress = "0x0000000000000000000000000000000000000001";
    const provider = new GoPlusProvider(NETWORK_CONFIGS.BASE, {
      apiKey: "test-only",
      client: new HttpJsonClient({
        fetchImpl: fakeFetch({
          code: 1,
          result: {
            [tokenAddress]: { is_open_source: null, holder_count: "999999999999999999999999" },
          },
        }),
      }),
    });
    const result = await provider.readToken(tokenAddress, fetchedAt);
    expect(result.status).toBe("AVAILABLE");
    expect(result.value?.isOpenSource).toBeNull();
    expect(result.value?.holderCount).toBeNull();
  });

  it("deduplicates Bubblemaps holders and retains unknown classifications", async () => {
    const tokenAddress = "0x0000000000000000000000000000000000000001";
    const provider = new BubblemapsProvider(NETWORK_CONFIGS.BASE, {
      apiKey: "test-only",
      client: new HttpJsonClient({
        fetchImpl: fakeFetch({
          token_address: tokenAddress,
          nodes: [
            { address: "0xholder", share: 0.02 },
            { address: "0xHOLDER", share: 0.03 },
            { address: "0xlp", share: 0.5, label: "LP" },
          ],
          clusters: [{ id: "cluster-1", nodes: ["0xholder", "0xlp"], share: 0.52 }],
        }),
      }),
    });
    const result = await provider.readToken(tokenAddress, fetchedAt);
    expect(result.status).toBe("AVAILABLE");
    expect(result.value?.holders).toHaveLength(2);
    expect(result.value?.holders.find((holder) => holder.address === "0xlp")?.classification).toBe(
      "LP",
    );
    expect(
      result.value?.holders.find((holder) => holder.address === "0xHOLDER")?.classification,
    ).toBe("UNKNOWN");
    expect(result.value?.largestConnectedNonSystemClusterPct).toBe(3);
  });

  it("parses canonical Solana mint authority, freeze authority, and largest accounts", async () => {
    const data = new Uint8Array(82);
    data[0] = 1;
    data[4] = 7;
    data[36] = 0x10;
    data[37] = 0x27;
    data[44] = 6;
    data[46] = 1;
    data[50] = 8;
    const provider = new SolanaRpcProvider(
      NETWORK_CONFIGS.SOLANA,
      "https://example.invalid",
      new HttpJsonClient({
        fetchImpl: (_url, init) => {
          const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as {
            method: string;
          };
          const result =
            body.method === "getAccountInfo"
              ? {
                  context: { slot: 99 },
                  value: {
                    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9SsAq1mD4",
                    data: [Buffer.from(data).toString("base64"), "base64"],
                  },
                }
              : { context: { slot: 99 }, value: [{ address: "holder", amount: "100" }] };
          return Promise.resolve(
            new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 }),
          );
        },
      }),
    );
    const result = await provider.readMint(
      "So11111111111111111111111111111111111111112",
      fetchedAt,
    );
    expect(result.status).toBe("AVAILABLE");
    expect(result.value?.slot).toBe(99n);
    expect(result.value?.tokenProgram).toBe("SPL_TOKEN");
    expect(result.value?.mintAuthority).not.toBeNull();
    expect(result.value?.freezeAuthority).not.toBeNull();
    expect(result.value?.decimals).toBe(6);
  });

  it("retries bounded transient failures and rejects malformed JSON", async () => {
    let calls = 0;
    const client = new HttpJsonClient({
      maxRetries: 2,
      sleep: () => Promise.resolve(),
      fetchImpl: () => {
        calls += 1;
        return Promise.resolve(
          new Response(calls < 3 ? "busy" : '{"ok":true}', { status: calls < 3 ? 503 : 200 }),
        );
      },
    });
    await expect(client.get("https://example.invalid")).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
    const malformed = new HttpJsonClient({
      fetchImpl: () => Promise.resolve(new Response("not-json", { status: 200 })),
    });
    await expect(malformed.get("https://example.invalid")).rejects.toThrow("malformed JSON");
  });

  it("classifies material disagreement as a qualification blocker", () => {
    const result = reconcileNumeric("liquidityUsd", [
      { source: "A", value: 800_000 },
      { source: "B", value: 520_000 },
    ]);
    expect(result.status).toBe("MATERIAL_DIVERGENCE");
    expect(result.disagreement?.resolution).toBe("BLOCK_AUTOMATIC_QUALIFICATION");
    expect(result.value).toBe(520_000);
  });
});

function pair(
  pairAddress: string,
  dexId: string,
  liquidity: number,
  chainId = "base",
): Record<string, unknown> {
  return {
    chainId,
    dexId,
    pairAddress,
    baseToken: {
      address: "0x0000000000000000000000000000000000000001",
      symbol: "TOK",
      name: "Token",
    },
    quoteToken: {
      address: "0x0000000000000000000000000000000000000002",
      symbol: "USDC",
      name: "USD Coin",
    },
    priceUsd: 1,
    txns: { h24: { buys: 10, sells: 8 } },
    volume: { h24: 20_000 },
    priceChange: { h24: 1.2 },
    liquidity: { usd: liquidity, base: 1_000, quote: liquidity },
    fdv: 2_000_000,
    marketCap: 1_500_000,
    pairCreatedAt: 1_700_000_000_000,
  };
}
