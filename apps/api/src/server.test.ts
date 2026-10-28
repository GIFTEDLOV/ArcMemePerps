import { get } from "node:http";
import { type AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { loadArcDeploymentConfig } from "@arcmemeperps/shared";
import { createReadOnlyApiServer, type ApiReadModel } from "./server.js";

function testReadModel(): ApiReadModel {
  return {
    listMarkets: () => Promise.resolve([]),
    getMarket: () => Promise.resolve(null),
    getWallet: () => Promise.resolve(null),
    getProfile: () => Promise.resolve(null),
    getNotifications: () => Promise.resolve([]),
    listUniverseMarkets: () => Promise.resolve({ items: [], total: 0, discoveryCount: 0, currentlyObservedCount: 0, staleRetainedCount: 0, perpCount: 0, sources: [] }),
    searchUniverseMarkets: () => Promise.resolve({ items: [], total: 0, discoveryCount: 0, currentlyObservedCount: 0, staleRetainedCount: 0, perpCount: 0, sources: [] }),
  };
}

async function withServer(run: (baseUrl: string) => Promise<void>, readModel = testReadModel()): Promise<void> {
  const server = createReadOnlyApiServer({
    readModel,
    health: () => [],
    runtime: {
      config: loadArcDeploymentConfig({ ARCMEMEPERPS_DEPLOYMENT_NETWORK: "MAINNET" }),
      discoveryCount: 0,
      registeredPerpCount: 0,
      livePerpCount: 0,
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}/api/v1`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("read-only API hostile input handling", () => {
  it("returns client errors for invalid pagination, chain, and addresses", async () => {
    await withServer(async (baseUrl) => {
      const invalidLimit = await fetch(`${baseUrl}/markets?limit=101`);
      expect(invalidLimit.status).toBe(400);
      await expect(invalidLimit.json()).resolves.toEqual({ error: "INVALID_LIMIT" });

      const invalidChain = await fetch(`${baseUrl}/markets?chain=NOT_A_CHAIN`);
      expect(invalidChain.status).toBe(400);
      await expect(invalidChain.json()).resolves.toEqual({ error: "UNSUPPORTED_CHAIN" });

      const invalidAddress = await fetch(`${baseUrl}/wallet/not-an-address`);
      expect(invalidAddress.status).toBe(400);
      await expect(invalidAddress.json()).resolves.toEqual({ error: "MALFORMED_ADDRESS" });
    });
  });

  it("flushes an idle realtime stream without fabricating an event", async () => {
    await withServer(async (baseUrl) => {
      await new Promise<void>((resolve, reject) => {
        const request = get(`${baseUrl}/stream`, (response) => {
          expect(response.statusCode).toBe(200);
          expect(response.headers["content-type"]).toContain("text/event-stream");
          response.once("data", (chunk: Buffer) => {
            expect(chunk.toString()).toContain(": connected");
            response.destroy();
            resolve();
          });
        });
        request.once("error", reject);
      });
    });
  });

  it("serves the Railway liveness route outside the versioned API", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(new URL("/health", baseUrl));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        service: "cluster-api",
        readOnly: true,
      });
    });
  });

  it("returns versioned market and protocol status payloads", async () => {
    await withServer(async (baseUrl) => {
      const markets = await fetch(`${baseUrl}/markets`);
      expect(markets.status).toBe(200);
      await expect(markets.json()).resolves.toMatchObject({
        schemaVersion: "v1",
        items: [],
        nextCursor: null,
        discoveryCount: 0,
        currentlyObservedCount: 0,
        staleRetainedCount: 0,
        sources: [],
      });

      const protocol = await fetch(`${baseUrl}/protocol/status`);
      expect(protocol.status).toBe(200);
      await expect(protocol.json()).resolves.toMatchObject({
        schemaVersion: "v1",
        readOnly: true,
        network: "Arc Mainnet",
        chainId: 5042,
      });
    });
  });

  it("returns provider freshness and observed totals with read-only discovery rows", async () => {
    const fetchedAt = new Date().toISOString();
    const source = { provider: "DEXSCREENER", status: "AVAILABLE", fetchedAt, marketCount: 4, reason: null };
    const readModel: ApiReadModel = {
      ...testReadModel(),
      listUniverseMarkets: () => Promise.resolve({
        items: [{ marketId: "market-1", providerState: { status: "AVAILABLE", fetchedAt }, freshness: { status: "UNAVAILABLE", observedAt: null } }],
        total: 1,
        discoveryCount: 8,
        currentlyObservedCount: 5,
        staleRetainedCount: 2,
        perpCount: 1,
        sources: [source],
      }),
    };

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/markets`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        discoveryCount: 8,
        currentlyObservedCount: 5,
        staleRetainedCount: 2,
        perpCount: 1,
        sources: [source],
        items: [{ marketId: "market-1", freshness: { status: "UNAVAILABLE" } }],
      });
    }, readModel);
  });
});
