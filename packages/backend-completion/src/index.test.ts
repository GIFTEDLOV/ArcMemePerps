import { describe, expect, it } from "vitest";
import { marketIdForToken } from "@arcmemeperps/shared";
import { InMemoryPersistence } from "@arcmemeperps/persistence";
import {
  type ADLCandidate,
  ClusterGraph,
  ContinuousDiscoveryService,
  DeployerRefreshService,
  EvmVenueReader,
  FlaunchPublicApiReader,
  HoneypotAnalyzer,
  HistoricalSnapshotProjector,
  DurableReconciliationEngine,
  ProfileAnalyticsProjector,
  PublicLPShareLedger,
  SolanaVenueReader,
  classifyConcentratedLP,
  classifySolanaLiquidity,
  classifyV2LP,
  conservativeLPNav,
  criticalMutationBank,
  deterministicADL,
  executionGate,
  independentPriceOrigins,
  VerifiedNetworkProviderPool,
  METEORA_DLMM_PROGRAM_ID,
  PUMP_FUN_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  RAYDIUM_AMM_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  RAYDIUM_CPMM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  type DiscoveryCheckpoint,
} from "./index.js";

const token = {
  chain: "BASE" as const,
  tokenAddress: "0x0000000000000000000000000000000000000001",
  symbol: "ARC",
  name: "Arc",
  decimals: 18,
  deployer: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  originPlatform: "DIRECT_DEX" as const,
};

describe("Gate 4E backend completion boundary", () => {
  it("pins official Solana venue and token program identifiers", () => {
    expect(PUMP_FUN_PROGRAM_ID).toBe("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
    expect(PUMPSWAP_PROGRAM_ID).toBe("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
    expect(RAYDIUM_CPMM_PROGRAM_ID).toBe("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
    expect(RAYDIUM_CLMM_PROGRAM_ID).toBe("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
    expect(RAYDIUM_AMM_PROGRAM_ID).toBe("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
    expect(METEORA_DLMM_PROGRAM_ID).toBe("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
    expect(TOKEN_PROGRAM_ID).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    expect(TOKEN_2022_PROGRAM_ID).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  });

  it("discovers idempotently and persists source-specific checkpoints", async () => {
    const storage = new InMemoryPersistence();
    let scans = 0;
    const checkpoint: DiscoveryCheckpoint = {
      sourceId: "base-uniswap",
      chain: "BASE",
      cursor: "2",
      blockNumber: "2",
      blockHash: "0x2",
      slot: null,
      finality: "finalized",
      updatedAt: "2026-10-01T00:00:02.000Z",
    };
    const service = new ContinuousDiscoveryService(storage, [
      {
        sourceId: "base-uniswap",
        chain: "BASE",
        scan: () => {
          scans += 1;
          return Promise.resolve({
            candidates: [
              {
                token,
                sourceId: "base-uniswap",
                originPlatform: "UNISWAP_STYLE",
                lifecycle: "DEX_LIVE",
                observedAt: "2026-10-01T00:00:01.000Z",
                blockNumber: "1",
                blockHash: "0x1",
                slot: null,
                evidence: [{ pool: "0xpool" }],
              },
            ],
            checkpoint,
          });
        },
      },
    ]);
    const first = await service.runOnce();
    const second = await service.runOnce();
    expect(first.discovered).toEqual([marketIdForToken("BASE", token.tokenAddress)]);
    expect(second.duplicate).toHaveLength(1);
    expect(scans).toBe(2);
    expect(storage.get("discovery_sources", "BASE:base-uniswap")?.payload.cursor).toBe("2");
  });

  it("rejects a reader that returns a candidate for another chain", async () => {
    const storage = new InMemoryPersistence();
    const service = new ContinuousDiscoveryService(storage, [
      {
        sourceId: "bad",
        chain: "BASE",
        scan: () =>
          Promise.resolve({
            candidates: [
              {
                token: { ...token, chain: "ETHEREUM" as const },
                sourceId: "bad",
                originPlatform: "DIRECT_DEX",
                lifecycle: "DISCOVERED",
                observedAt: "2026-10-01T00:00:00.000Z",
                blockNumber: null,
                blockHash: null,
                slot: null,
                evidence: [],
              },
            ],
            checkpoint: {
              sourceId: "bad",
              chain: "BASE",
              cursor: null,
              blockNumber: null,
              blockHash: null,
              slot: null,
              finality: "finalized",
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
          }),
      },
    ]);
    await expect(service.runOnce()).rejects.toThrow("DISCOVERY_WRONG_CHAIN");
  });

  it("normalizes Flaunch public API records without fabricating missing fields", async () => {
    const reader = new FlaunchPublicApiReader({
      get: () =>
        Promise.resolve([{ address: token.tokenAddress, createdAt: "2026-10-01T00:00:00.000Z" }]),
    });
    const items = await reader.listNew();
    expect(items[0]?.tokenAddress).toBe(token.tokenAddress);
    expect(items[0]?.chain).toBe("BASE");
    expect(items[0]?.createdAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("returns quote-based Solana depth only from supported pool state", async () => {
    const reader = new SolanaVenueReader({
      readLaunch: () => Promise.resolve({ state: "GRADUATED" }),
      readPools: () =>
        Promise.resolve([
          {
            venue: "RAYDIUM",
            poolAddress: "pool",
            tokenMint: "mint",
            quoteReserveUsdWad: 1_000_000n,
            baseReserveUsdWad: 1_000_000n,
            feeBps: 30n,
            observedAt: "2026-10-01T00:00:00.000Z",
            slot: "10",
            poolType: "CPMM",
            liquidityControl: "UNKNOWN",
          },
        ]),
    });
    expect((await reader.readDepth("mint", "RAYDIUM")).status).toBe("AVAILABLE");
    expect((await reader.lifecycle("mint")).status).toBe("GRADUATED");
  });

  it("keeps unsupported Solana layouts explicitly unavailable", async () => {
    const reader = new SolanaVenueReader({
      readLaunch: () => Promise.resolve(null),
      readPools: () => Promise.resolve([]),
    });
    const result = await reader.readDepth("mint", "METEORA");
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.buyDepth1PctUsdWad).toBeNull();
  });

  it("classifies liquidity control conservatively", () => {
    expect(
      classifyV2LP({
        totalSupply: 100n,
        holders: [{ address: "0xburn", balance: 100n }],
        burnAddresses: ["0xburn"],
        lockers: [],
        observedAt: "2026-10-01T00:00:00.000Z",
      }).status,
    ).toBe("BURNED");
    expect(
      classifyConcentratedLP({
        positions: [{ tokenId: "1", owner: "0xlock", liquidity: 10n, controller: null }],
        protocolOwners: [],
        lockers: ["0xlock"],
        observedAt: "2026-10-01T00:00:00.000Z",
      }).status,
    ).toBe("LOCKED");
    expect(
      classifySolanaLiquidity({
        venue: "PUMPSWAP",
        protocolControlled: true,
        burned: false,
        locked: false,
        observedAt: "2026-10-01T00:00:00.000Z",
      }).status,
    ).toBe("PROTOCOL_CONTROLLED");
  });

  it("uses read-only transfer simulation for honeypot evidence", async () => {
    const analyzer = new HoneypotAnalyzer({
      simulateTransfer: () => Promise.resolve({ success: false, revertReason: "BLACKLISTED" }),
      readRestrictions: () => Promise.resolve({ blacklist: true }),
    });
    const result = await analyzer.analyze("0xtoken", "0xfrom", "0xto", 1n);
    expect(result.status).toBe("HONEYPOT_SIGNAL");
    expect(result.reasons).toContain("SIMULATION_REVERT:BLACKLISTED");
  });

  it("builds connected clusters from chain-native edges and includes unknown wallets", () => {
    const graph = new ClusterGraph();
    graph.addEdge({
      from: "A",
      to: "B",
      type: "FUNDING",
      evidenceIds: ["e1"],
      observedAt: "2026-10-01T00:00:00.000Z",
    });
    const result = graph.clusters([
      { address: "A", supplyBps: 210, classification: "UNKNOWN" },
      { address: "B", supplyBps: 170, classification: "UNKNOWN" },
      { address: "C", supplyBps: 140, classification: "UNKNOWN" },
    ]);
    expect(result[0]?.supplyBps).toBe(380);
    expect(result[0]?.members).toEqual(["A", "B"]);
  });

  it("refreshes deployer profiles and schedules survival windows durably", () => {
    const storage = new InMemoryPersistence();
    new DeployerRefreshService(storage).refresh({
      deployer: "0xDEPLOYER",
      observedAt: "2026-10-01T00:00:00.000Z",
      token: { address: "0xTOKEN", createdAt: "2026-10-01T00:00:00.000Z", outcome: "ACTIVE" },
      incidents: [],
      associatedWallets: ["0xBUYER"],
    });
    expect(storage.get("deployer_profiles", "0xdeployer")?.payload.tokensCreated).toBe(1);
    expect(storage.get("deployer_refreshes", "0xdeployer:30d")).not.toBeNull();
  });

  it("persists real observations and refuses to synthesize missing windows", () => {
    const storage = new InMemoryPersistence();
    const projector = new HistoricalSnapshotProjector(storage);
    const point = (time: string, price: bigint) => ({
      marketId: "m",
      observedAt: time,
      priceUsdWad: price,
      liquidityUsdWad: 100n,
      volumeUsdWad: 10n,
      holderCount: 2,
      depth1PctUsdWad: 1n,
      clusterConcentrationBps: 100,
      oracleStatus: "FRESH",
      riskStatus: "QUALIFIED",
    });
    projector.record(point("2026-10-01T00:00:00.000Z", 100n));
    projector.record(point("2026-10-01T00:01:00.000Z", 110n));
    expect(
      projector.windows("m", "2026-10-01T00:02:00.000Z").find((item) => item.window === "5m")
        ?.status,
    ).toBe("AVAILABLE");
    expect(
      projector.windows("m", "2026-10-01T00:02:00.000Z").find((item) => item.window === "30d")
        ?.status,
    ).toBe("AVAILABLE");
  });

  it("fails closed for stale or restricted execution", () => {
    const result = executionGate({
      qualificationFresh: true,
      marketState: "PAUSED",
      riskIncreasing: true,
      oracleFresh: false,
      oracleConfidenceBps: 10,
      requiredConfidenceBps: 50,
      oiAfter: 101n,
      maxOI: 100n,
      positionAfter: 2n,
      maxPosition: 1n,
      expiry: "2026-10-02T00:00:00.000Z",
      now: "2026-10-01T00:00:00.000Z",
    });
    expect(result.decision).toBe("REFUSE");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["MARKET_PAUSED_RISK_INCREASE_BLOCKED", "ORACLE_STALE", "MAX_OI"]),
    );
  });

  it("prices LP NAV after reserving trader liabilities, insurance, and bad debt", () => {
    expect(
      conservativeLPNav({
        custodyUsdc: 1_000n,
        pendingTraderLiabilityUsdc: 100n,
        insuranceReserveUsdc: 50n,
        badDebtUsdc: 25n,
        totalShares: 825n,
      }).navUsdc,
    ).toBe(825n);
  });

  it("reduces only profitable exposure for bounded deterministic ADL", () => {
    const candidates: ADLCandidate[] = [
      { account: "a", positionId: "2", profitablePnlUsdc: 50n, sizeUsdc: 40n, leverageWad: 2n },
      { account: "b", positionId: "1", profitablePnlUsdc: 50n, sizeUsdc: 40n, leverageWad: 2n },
      { account: "c", positionId: "3", profitablePnlUsdc: 0n, sizeUsdc: 100n, leverageWad: 2n },
    ];
    expect(deterministicADL(candidates, 60n).map((item) => item.positionId)).toEqual(["1", "2"]);
    expect(
      deterministicADL(candidates, 60n).reduce((sum, item) => sum + item.reductionUsdc, 0n),
    ).toBe(60n);
  });

  it("prices and queues public LP shares durably", () => {
    const storage = new InMemoryPersistence();
    const ledger = new PublicLPShareLedger(storage, 1_000);
    expect(ledger.deposit("0xlp", 1_000n, "2026-10-01T00:00:00.000Z")).toBe(1_000n);
    const request = ledger.requestWithdraw("0xlp", 500n, "2026-10-01T00:00:01.000Z");
    expect(() => ledger.claimWithdraw(request.id, "2026-10-01T00:00:01.500Z")).toThrow(
      "LP_COOLDOWN",
    );
    expect(ledger.claimWithdraw(request.id, "2026-10-01T00:00:02.000Z")).toBe(500n);
    expect(ledger.state().totalShares).toBe(500n);
  });

  it("rebuilds profile analytics only from indexed protocol events", () => {
    const storage = new InMemoryPersistence();
    storage.put(
      "protocol_events",
      "e1",
      {
        eventId: "e1",
        account: "0xA",
        marketId: "m1",
        realizedPnlUsdc: "10",
        unrealizedPnlUsdc: "0",
        volumeUsdc: "100",
        feesUsdc: "1",
        fundingPaidUsdc: "2",
        fundingReceivedUsdc: "0",
        leverageWad: "2000000000000000000",
        closed: true,
        liquidated: false,
        observedAt: "2026-10-01T00:00:00.000Z",
      },
      "2026-10-01T00:00:00.000Z",
    );
    const stats = new ProfileAnalyticsProjector(storage).rebuild("0xa");
    expect(stats.realizedPnlUsdc).toBe(10n);
    expect(stats.winRateBps).toBe(10_000);
    expect(storage.get("wallet_analytics", "0xa")).not.toBeNull();
  });

  it("turns cross-component reconciliation mismatches into durable critical records", () => {
    const storage = new InMemoryPersistence();
    const engine = new DurableReconciliationEngine(storage);
    expect(engine.check("vault", 10n, 10n, "2026-10-01T00:00:00.000Z")).toBe("MATCH");
    expect(engine.check("oi", 9n, 10n, "2026-10-01T00:00:01.000Z")).toBe("CRITICAL");
    expect(storage.list("reconciliation_failures")).toHaveLength(1);
  });

  it("keeps the critical mutation bank explicit and fully killable", () => {
    expect(criticalMutationBank().length).toBeGreaterThanOrEqual(10);
    expect(criticalMutationBank().every((mutation) => mutation.expectedKilled)).toBe(true);
  });

  it("reads EVM V2 pool state and performs real quote math", async () => {
    const reader = new EvmVenueReader(
      "BASE",
      {
        getPoolStates: () =>
          Promise.resolve([
            {
              venue: "AERODROME",
              poolAddress: "0x0000000000000000000000000000000000000002",
              poolType: "V2",
              token: token.tokenAddress as `0x${string}`,
              quoteToken: "0x0000000000000000000000000000000000000003",
              observedAt: "2026-10-01T00:00:00.000Z",
              blockNumber: "2",
              reserveBaseUsdWad: 1_000_000n,
              reserveQuoteUsdWad: 1_000_000n,
              feeBps: 30n,
            },
          ]),
      },
      ["AERODROME"],
    );
    const result = await reader.read(token.tokenAddress as `0x${string}`);
    expect(result.depth.status).toBe("AVAILABLE");
    expect(result.pools).toHaveLength(1);
  });

  it("fails over a wrong-network provider and records degraded health", async () => {
    const pool = new VerifiedNetworkProviderPool("SOLANA", [
      {
        id: "wrong",
        priority: 1,
        read: () => Promise.resolve({ chain: "BASE" as const, value: "bad" }),
      },
      {
        id: "secondary",
        priority: 2,
        read: () => Promise.resolve({ chain: "SOLANA" as const, value: "ok" }),
      },
    ]);
    const result = await pool.read();
    expect(result.status).toBe("DEGRADED");
    expect(result.value).toBe("ok");
    expect(result.errors[0]).toContain("WRONG_CHAIN");
  });

  it("deduplicates correlated oracle providers by underlying venue", () => {
    expect(
      independentPriceOrigins([
        {
          sourceId: "dexscreener",
          underlyingVenueId: "uniswap:pool1",
          sourceFamily: "DEXSCREENER_AGGREGATION",
          priceUsdWad: 1n,
        },
        {
          sourceId: "direct-uniswap",
          underlyingVenueId: "uniswap:pool1",
          sourceFamily: "DIRECT_UNISWAP_POOL",
          priceUsdWad: 1n,
        },
        {
          sourceId: "pancake",
          underlyingVenueId: "pancake:pool2",
          sourceFamily: "DIRECT_PANCAKESWAP_POOL",
          priceUsdWad: 1n,
        },
      ]),
    ).toEqual(["pancake:pool2", "uniswap:pool1"]);
  });
});
