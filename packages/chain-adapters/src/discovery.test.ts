import { describe, expect, it } from "vitest";
import {
  DiscoveryCoordinator,
  FourMemeDiscoveryAdapter,
  FourMemeOnchainSource,
  FourMemePublicApiSource,
  UnavailableLaunchpadDiscovery,
  type FourMemeDiscoverySource,
  type FourMemeTokenRecord,
} from "./discovery.js";
import type { PublicClient } from "viem";

describe("discovery plugin boundaries", () => {
  it("does not synthesize candidates when a launchpad source is unavailable", async () => {
    const adapter = new UnavailableLaunchpadDiscovery(
      "PUMP_FUN",
      "SOLANA",
      "DOCUMENTATION_OR_ACCESS_UNAVAILABLE",
    );
    expect(await new DiscoveryCoordinator([adapter]).discoverAll()).toEqual([]);
    await expect(adapter.lifecycle("mint")).rejects.toThrow("UNAVAILABLE:PUMP_FUN");
  });

  it("normalizes documented Four.meme lifecycle evidence without inferring graduation", async () => {
    const records: FourMemeTokenRecord[] = [
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        creator: "0x2222222222222222222222222222222222222222",
        symbol: "BOND",
        name: "Bonding",
        decimals: 18,
        createdAt: "2026-01-01T00:00:00.000Z",
        graduated: false,
        poolAddress: null,
        blockNumber: "100",
        transactionHash: `0x${"1".repeat(64)}`,
        observedAt: "2026-01-01T00:01:00.000Z",
      },
      {
        tokenAddress: "0x3333333333333333333333333333333333333333",
        creator: "0x4444444444444444444444444444444444444444",
        symbol: "DEX",
        name: "Graduated",
        decimals: 18,
        createdAt: "2026-01-01T00:00:00.000Z",
        graduated: true,
        poolAddress: "0x5555555555555555555555555555555555555555",
        blockNumber: "101",
        transactionHash: `0x${"2".repeat(64)}`,
        observedAt: "2026-01-01T00:01:00.000Z",
      },
    ];
    const source: FourMemeDiscoverySource = {
      provider: "fixture-four-meme",
      discoverTokens: () => Promise.resolve(records),
      getToken: (address) =>
        Promise.resolve(records.find((record) => record.tokenAddress === address) ?? null),
    };
    const adapter = new FourMemeDiscoveryAdapter(source);
    const candidates = await adapter.discover();
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.token.originPlatform).toBe("FOUR_MEME_STYLE");
    expect(candidates[0]?.evidence.map((item) => item.stage)).toEqual(["DISCOVERED", "BONDING"]);
    expect(candidates[1]?.evidence.map((item) => item.stage)).toEqual([
      "DISCOVERED",
      "GRADUATED",
      "DEX_LIVE",
    ]);
  });

  it("reads the documented public token-query response shape and rejects malformed identity", async () => {
    const valid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const source = new FourMemePublicApiSource({
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "0",
              data: {
                list: [
                  {
                    token: valid,
                    creator: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    symbol: "API",
                    name: "API Token",
                    decimals: 18,
                    status: "PUBLISH",
                    launchTime: 1_735_689_600,
                  },
                  { token: "not-an-address", symbol: "BAD" },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
    });
    const records = await source.discoverTokens();
    expect(records).toHaveLength(1);
    expect(records[0]?.tokenAddress).toBe(valid);
    expect(records[0]?.graduated).toBe(false);
  });

  it("decodes TokenManager2 events with a resumable block cursor", async () => {
    const token = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const creator = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let logCall = 0;
    const client = {
      getBlockNumber: () => Promise.resolve(200n),
      getLogs: () => {
        logCall += 1;
        return Promise.resolve(
          logCall === 1
            ? [
                {
                  args: { creator, token, name: "Onchain", symbol: "ONC" },
                  blockNumber: 150n,
                  transactionHash: `0x${"3".repeat(64)}`,
                },
              ]
            : [{ args: { base: token } }],
        );
      },
      getBlock: () => Promise.resolve({ timestamp: 1_735_689_600n }),
    } as unknown as PublicClient;
    const source = new FourMemeOnchainSource({ client, fromBlock: 100n });
    const records = await source.discoverTokens("120");
    expect(records).toHaveLength(1);
    expect(records[0]?.tokenAddress).toBe(token);
    expect(records[0]?.creator).toBe(creator);
    expect(records[0]?.graduated).toBe(true);
    expect(records[0]?.blockNumber).toBe("150");
  });
});
