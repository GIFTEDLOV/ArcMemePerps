import { createHash } from "node:crypto";
import type { JsonValue } from "./types.js";

export const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMPSWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const PUMPSWAP_POOL_ACCOUNT_DISCRIMINATOR =
  "f19a6d0411b16dbc" as const;
export const PUMPSWAP_BUY_EVENT_DISCRIMINATOR =
  "67f4521f2cf57777" as const;
export const PUMPSWAP_SELL_EVENT_DISCRIMINATOR =
  "3e2f370aa503dc2a" as const;
export const SOLANA_SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const SOLANA_INCINERATOR_ADDRESS =
  "1nc1nerator11111111111111111111111111111111";
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
export const PUMP_PUBLIC_DOCS_VERSION = "pump-public-docs@main (verified 2026-10-06)";

const MAX_U64 = (1n << 64n) - 1n;
const MAX_I128 = (1n << 127n) - 1n;
const MIN_I128 = -(1n << 127n);
const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");
const ED25519_P = (1n << 255n) - 19n;
const ED25519_D = mod(-121665n * modInverse(121666n, ED25519_P), ED25519_P);
const ED25519_SQRT_M1 =
  19681161376707505956807079304988542015446066515923890162744021073123829784752n;

export type PumpProofStatus = "PROVEN" | "NOT_FOUND" | "UNKNOWN" | "CONFLICTED";
export type PumpLpControl =
  | "BURNED"
  | "PROTOCOL_CONTROLLED"
  | "IMMUTABLE_MIGRATION_CONTROL"
  | "CONFLICTED"
  | "UNKNOWN";

export interface PumpSwapPoolState {
  readonly pool: string;
  readonly accountOwner: string;
  readonly accountDataLength: number;
  readonly poolBump: number;
  readonly index: number;
  readonly creator: string;
  readonly baseMint: string;
  readonly quoteMint: string;
  readonly lpMint: string;
  readonly baseVault: string;
  readonly quoteVault: string;
  readonly lpSupply: bigint;
  readonly coinCreator: string;
  readonly isMayhemMode: boolean;
  readonly isCashbackCoin: boolean;
  readonly virtualQuoteReserves: bigint;
  readonly creatorFeeBps: bigint | null;
  readonly canEditCreatorFee: boolean | null;
  readonly isHolderReward: boolean | null;
  readonly slot: bigint;
  readonly rawEvidenceHash: string;
}

export interface PumpSwapPriceEvidence {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly priceQuotePerBase: string | null;
  readonly baseReserve: bigint | null;
  readonly rawQuoteReserve: bigint | null;
  readonly effectiveQuoteReserve: bigint | null;
  readonly feeBps: bigint | null;
  readonly formulaVersion: "pumpswap-constant-product-effective-quote-v1";
  readonly slot: bigint;
  readonly evidenceHash: string;
  readonly reason: string | null;
}

export interface PumpSwapDepthEvidence {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly quoteAsset: string;
  readonly feeBps: bigint | null;
  readonly buy1: bigint | null;
  readonly sell1: bigint | null;
  readonly buy2: bigint | null;
  readonly sell2: bigint | null;
  readonly buy5: bigint | null;
  readonly sell5: bigint | null;
  readonly formulaVersion: "pumpswap-executable-quote-simulation-v1";
  readonly provenance: "DIRECT_POOL_STATE" | "UNAVAILABLE";
  readonly reason: string | null;
}

export interface PumpSwapDepthQuote {
  readonly buy1: bigint;
  readonly sell1: bigint;
  readonly buy2: bigint;
  readonly sell2: bigint;
  readonly buy5: bigint;
  readonly sell5: bigint;
}

export interface PumpHolderEvidence {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly supply: bigint | null;
  readonly largestRawTokenAccountPct: number | null;
  readonly largestResolvedOwnerPct: number | null;
  readonly top10ResolvedOwnerPct: number | null;
  readonly unresolvedConcentrationPct: number | null;
  readonly resolvedAccounts: number;
  readonly excludedSystemOwners: readonly {
    readonly owner: string;
    readonly evidence: string;
  }[];
  readonly reason: string | null;
}

export interface PumpTradeObservation {
  readonly signature: string;
  readonly side: "BUY" | "SELL";
  readonly wallet: string | null;
  readonly baseAmount: bigint;
  readonly quoteAmount: bigint;
  readonly timestamp: number | null;
  readonly slot: bigint;
  readonly pool: string;
  readonly source: "PUMPSWAP_BUY_EVENT" | "PUMPSWAP_SELL_EVENT";
}

export interface PumpActivityEvidence {
  readonly status: "AVAILABLE" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
  readonly observationWindow: { readonly first: string | null; readonly last: string | null };
  readonly sampleCount: number;
  readonly trades: readonly PumpTradeObservation[];
  readonly source: "PUMPSWAP_EVENTS" | "UNAVAILABLE";
  readonly reason: string | null;
}

export interface CanonicalPumpMarketEvidence {
  readonly mint: string;
  readonly launchProgram: typeof PUMP_FUN_PROGRAM_ID;
  readonly graduationEvidence: {
    readonly status: PumpProofStatus;
    readonly migrationSignature: string | null;
    readonly slot: bigint | null;
    readonly source: "PUMPSWAP_CANONICAL_POOL_AND_MIGRATE_TX" | "UNAVAILABLE";
    readonly evidenceIds: readonly string[];
  };
  readonly canonicalPool: {
    readonly address: string;
    readonly index: number;
    readonly creator: string;
    readonly canonicalCreatorPda: string;
    readonly pumpSwapProgramId: typeof PUMPSWAP_PROGRAM_ID;
  };
  readonly baseMint: string;
  readonly quoteMint: string;
  readonly poolCreator: string;
  readonly lpMint: string;
  readonly baseVault: string;
  readonly quoteVault: string;
  readonly slot: bigint;
  readonly observedAt: string;
  readonly accountDataLength: number;
  readonly rawEvidenceHash: string;
  readonly lpControl: PumpLpControl;
  readonly lpControlEvidence: readonly string[];
  readonly lpMintSupply: bigint | null;
  readonly lpLargestBurnPct: number | null;
  readonly price: PumpSwapPriceEvidence;
  readonly depth: PumpSwapDepthEvidence;
  readonly holders: PumpHolderEvidence | null;
  readonly activity: PumpActivityEvidence;
  readonly creator: {
    readonly launchCreator: string | null;
    readonly coinCreator: string;
    readonly metadataAuthority: string | null;
    readonly assessment: "CLEAR" | "RISK_FOUND" | "UNKNOWN";
  };
}

export interface CanonicalPumpMarketRead {
  readonly status: PumpProofStatus;
  readonly value: CanonicalPumpMarketEvidence | null;
  readonly reason: string | null;
}

export interface CanonicalPumpPoolRead {
  readonly status: PumpProofStatus;
  readonly pool: PumpSwapPoolState | null;
  readonly poolAddress: string;
  readonly canonicalCreatorPda: string;
  readonly reason: string | null;
}

export function effectiveQuoteReserves(rawQuoteVaultBalance: bigint, virtualQuoteReserves: bigint): bigint {
  return rawQuoteVaultBalance + virtualQuoteReserves;
}

export function simulatePumpSwapDepth(
  baseReserve: bigint,
  rawQuoteVaultBalance: bigint,
  virtualQuoteReserves: bigint,
  feeBps: bigint,
): PumpSwapDepthQuote {
  const quoteReserve = effectiveQuoteReserves(rawQuoteVaultBalance, virtualQuoteReserves);
  if (baseReserve <= 0n || quoteReserve <= 0n || feeBps < 0n || feeBps >= 10_000n)
    throw new Error("invalid PumpSwap reserves or fee");
  return {
    buy1: depthForMove(baseReserve, quoteReserve, 100n, feeBps, true),
    sell1: depthForMove(baseReserve, quoteReserve, 100n, feeBps, false),
    buy2: depthForMove(baseReserve, quoteReserve, 200n, feeBps, true),
    sell2: depthForMove(baseReserve, quoteReserve, 200n, feeBps, false),
    buy5: depthForMove(baseReserve, quoteReserve, 500n, feeBps, true),
    sell5: depthForMove(baseReserve, quoteReserve, 500n, feeBps, false),
  };
}

export function assessCanonicalPoolIdentity(
  pool: Pick<PumpSwapPoolState, "accountOwner" | "index" | "creator" | "baseMint" | "quoteMint">,
  mint: string,
  poolAddress: string,
): { readonly status: Exclude<PumpProofStatus, "NOT_FOUND">; readonly reasons: readonly string[] } {
  const canonicalCreatorPda = PumpSwapReader.derivePoolAuthority(mint);
  const reasons = [
    pool.accountOwner !== PUMPSWAP_PROGRAM_ID ? "POOL_PROGRAM_OWNER_MISMATCH" : null,
    pool.index !== 0 ? "CANONICAL_POOL_INDEX_NOT_ZERO" : null,
    pool.creator !== canonicalCreatorPda ? "CANONICAL_POOL_CREATOR_MISMATCH" : null,
    pool.baseMint !== mint ? "CANONICAL_POOL_BASE_MINT_MISMATCH" : null,
    pool.quoteMint !== WRAPPED_SOL_MINT ? "CANONICAL_POOL_QUOTE_MINT_UNSUPPORTED" : null,
    PumpSwapReader.deriveCanonicalPool(mint, pool.quoteMint) !== poolAddress ? "CANONICAL_POOL_PDA_MISMATCH" : null,
  ].filter((item): item is string => item !== null);
  return { status: reasons.length === 0 ? "PROVEN" : "CONFLICTED", reasons };
}

interface RpcAccount {
  readonly owner: string;
  readonly data: readonly [string, string] | { readonly parsed?: unknown; readonly program?: string; readonly space?: number };
}

interface RpcAccountInfo {
  readonly context: { readonly slot: number };
  readonly value: RpcAccount | null;
}

interface RpcMultipleAccounts {
  readonly context: { readonly slot: number };
  readonly value: readonly (RpcAccount | null)[];
}

interface RpcSignature {
  readonly signature: string;
  readonly slot: number;
  readonly blockTime: number | null;
  readonly err: unknown;
}

interface RpcTransaction {
  readonly slot?: number;
  readonly blockTime?: number | null;
  readonly meta?: { readonly logMessages?: readonly string[] | null } | null;
}

export interface SolanaRpcRequestClient {
  request<T>(method: string, params: JsonValue[]): Promise<T>;
}

interface RpcProgramAccount {
  readonly pubkey: string;
  readonly account: RpcAccount;
}

export class PumpSwapReader {
  public constructor(
    private readonly rpc: SolanaRpcRequestClient,
    private readonly options: { readonly historyLimit?: number; readonly tradeLimit?: number } = {},
  ) {}

  public static derivePoolAuthority(baseMint: string): string {
    return findProgramAddress([new TextEncoder().encode("pool-authority"), decodeBase58(baseMint)], PUMP_FUN_PROGRAM_ID).address;
  }

  public static deriveCanonicalPool(baseMint: string, quoteMint = WRAPPED_SOL_MINT): string {
    const creator = PumpSwapReader.derivePoolAuthority(baseMint);
    return findProgramAddress(
      [new TextEncoder().encode("pool"), u16le(0), decodeBase58(creator), decodeBase58(baseMint), decodeBase58(quoteMint)],
      PUMPSWAP_PROGRAM_ID,
    ).address;
  }

  public static deriveGlobalConfig(): string {
    return findProgramAddress([new TextEncoder().encode("global_config")], PUMPSWAP_PROGRAM_ID).address;
  }

  public static decodePoolAccount(poolAddress: string, account: RpcAccountInfo): PumpSwapPoolState {
    if (account.value === null || !isBase64AccountData(account.value.data)) throw new Error("PUMPSWAP_POOL_ACCOUNT_MISSING");
    const bytes = decodeBase64(account.value.data[0]);
    const expected = fromHex(PUMPSWAP_POOL_ACCOUNT_DISCRIMINATOR);
    if (!equalBytes(bytes.slice(0, 8), expected)) throw new Error("PUMPSWAP_POOL_DISCRIMINATOR_MISMATCH");
    if (bytes.length < 245) throw new Error("PUMPSWAP_POOL_LAYOUT_TOO_SHORT");
    const virtualQuoteReserves = bytes.length >= 261 ? readI128(bytes, 245) : 0n;
    const creatorFeeBps = bytes.length >= 269 ? readU64(bytes, 261) : null;
    const canEditCreatorFee = bytes.length >= 270 ? bytes[269] === 1 : null;
    const isHolderReward = bytes.length >= 271 ? bytes[270] === 1 : null;
    return {
      pool: poolAddress,
      accountOwner: account.value.owner,
      accountDataLength: bytes.length,
      poolBump: bytes[8]!,
      index: readU16(bytes, 9),
      creator: encodeBase58(bytes.slice(11, 43)),
      baseMint: encodeBase58(bytes.slice(43, 75)),
      quoteMint: encodeBase58(bytes.slice(75, 107)),
      lpMint: encodeBase58(bytes.slice(107, 139)),
      baseVault: encodeBase58(bytes.slice(139, 171)),
      quoteVault: encodeBase58(bytes.slice(171, 203)),
      lpSupply: readU64(bytes, 203),
      coinCreator: encodeBase58(bytes.slice(211, 243)),
      isMayhemMode: bytes[243] === 1,
      isCashbackCoin: bytes[244] === 1,
      virtualQuoteReserves,
      creatorFeeBps,
      canEditCreatorFee,
      isHolderReward,
      slot: BigInt(account.context.slot),
      rawEvidenceHash: sha256Hex(bytes),
    };
  }

  public async readCanonicalPool(mint: string): Promise<CanonicalPumpPoolRead> {
    const canonicalCreatorPda = PumpSwapReader.derivePoolAuthority(mint);
    const poolAddress = PumpSwapReader.deriveCanonicalPool(mint);
    try {
      const account = await this.rpc.request<RpcAccountInfo>("getAccountInfo", [
        poolAddress,
        { encoding: "base64", commitment: "confirmed" },
      ]);
      if (account.value === null) {
        const byMint = await this.rpc.request<readonly RpcProgramAccount[]>("getProgramAccounts", [
          PUMPSWAP_PROGRAM_ID,
          {
            encoding: "base64",
            filters: [{ memcmp: { offset: 43, bytes: mint } }],
            commitment: "confirmed",
          },
        ]);
        const decoded = byMint.flatMap((item) => {
          try {
            return [PumpSwapReader.decodePoolAccount(item.pubkey, { context: { slot: 0 }, value: item.account })];
          } catch {
            return [];
          }
        });
        if (decoded.length > 0)
          return {
            status: "CONFLICTED",
            pool: null,
            poolAddress,
            canonicalCreatorPda,
            reason: `ARBITRARY_PUMPSWAP_POOL_PRESENT_CANONICAL_PDA_EMPTY:${decoded.map((item) => item.pool).join(",")}`,
          };
        return { status: "NOT_FOUND", pool: null, poolAddress, canonicalCreatorPda, reason: "CANONICAL_PUMPSWAP_POOL_NOT_FOUND" };
      }
      const pool = PumpSwapReader.decodePoolAccount(poolAddress, account);
      const identity = assessCanonicalPoolIdentity(pool, mint, poolAddress);
      return {
        status: identity.status,
        pool: identity.status === "PROVEN" ? pool : null,
        poolAddress,
        canonicalCreatorPda,
        reason: identity.reasons.length === 0 ? null : identity.reasons.join(","),
      };
    } catch (error) {
      return {
        status: "UNKNOWN",
        pool: null,
        poolAddress,
        canonicalCreatorPda,
        reason: error instanceof Error ? error.message : "CANONICAL_PUMPSWAP_POOL_READ_FAILED",
      };
    }
  }

  public async readCanonicalMarket(
    mint: string,
    observedAt = new Date().toISOString(),
  ): Promise<CanonicalPumpMarketRead> {
    try {
      const canonical = await this.readCanonicalPool(mint);
      if (canonical.pool === null)
        return { status: canonical.status, value: null, reason: canonical.reason };
      const { pool, poolAddress, canonicalCreatorPda } = canonical;

      const [tokenAccounts, lpMintAccount, globalConfig] = await Promise.all([
        this.rpc.request<RpcMultipleAccounts>("getMultipleAccounts", [
          [pool.baseVault, pool.quoteVault, pool.baseMint, pool.quoteMint],
          { encoding: "jsonParsed", commitment: "confirmed" },
        ]),
        this.rpc.request<RpcAccountInfo>("getAccountInfo", [
          pool.lpMint,
          { encoding: "jsonParsed", commitment: "confirmed" },
        ]),
        this.readGlobalConfig(),
      ]);
      const baseVaultAmount = parsedTokenAmount(tokenAccounts.value[0]);
      const quoteVaultAmount = parsedTokenAmount(tokenAccounts.value[1]);
      const baseMintMeta = parsedMint(tokenAccounts.value[2]);
      const quoteMintMeta = parsedMint(tokenAccounts.value[3]);
      if (baseVaultAmount === null || quoteVaultAmount === null || baseMintMeta === null || quoteMintMeta === null)
        return { status: "UNKNOWN", value: null, reason: "CANONICAL_POOL_RESERVE_OR_MINT_EVIDENCE_UNAVAILABLE" };
      const lpMintMeta = parsedMint(lpMintAccount.value);
      const lpSupply = lpMintMeta?.supply ?? null;
      const lpLargest = await this.readLargestOwners(pool.lpMint, lpSupply, pool);
      const migration = await this.readMigrationEvidence(poolAddress);
      const effectiveQuoteReserves = quoteVaultAmount + pool.virtualQuoteReserves;
      const feeBps = globalConfig === null ? null : globalConfig.lpFeeBps + globalConfig.protocolFeeBps + globalConfig.creatorFeeBps;
      const price = buildPriceEvidence(pool, baseVaultAmount, quoteVaultAmount, effectiveQuoteReserves, feeBps);
      const depth = buildDepthEvidence(pool, baseVaultAmount, effectiveQuoteReserves, feeBps);
      const holders = await this.readLargestOwners(mint, baseMintMeta.supply, pool);
      const activity = await this.readTradeActivity(poolAddress);
      const lpControl = classifyLpControl(pool, lpMintMeta, lpLargest, migration.status);
      const canonicalEvidence: CanonicalPumpMarketEvidence = {
        mint,
        launchProgram: PUMP_FUN_PROGRAM_ID,
        graduationEvidence: migration,
        canonicalPool: {
          address: poolAddress,
          index: pool.index,
          creator: pool.creator,
          canonicalCreatorPda,
          pumpSwapProgramId: PUMPSWAP_PROGRAM_ID,
        },
        baseMint: pool.baseMint,
        quoteMint: pool.quoteMint,
        poolCreator: pool.creator,
        lpMint: pool.lpMint,
        baseVault: pool.baseVault,
        quoteVault: pool.quoteVault,
        slot: pool.slot,
        observedAt,
        accountDataLength: pool.accountDataLength,
        rawEvidenceHash: pool.rawEvidenceHash,
        lpControl,
        lpControlEvidence: [
          "official:pump-public-docs:pump-swap-migration-lp-burn",
          `rpc:pumpswap-pool:${pool.rawEvidenceHash}`,
          ...(lpLargest?.evidenceIds ?? []),
        ],
        lpMintSupply: lpSupply,
        lpLargestBurnPct: lpLargest?.largestBurnPct ?? null,
        price,
        depth,
        holders,
        activity,
        creator: {
          launchCreator: null,
          coinCreator: pool.coinCreator,
          metadataAuthority: null,
          assessment: "UNKNOWN",
        },
      };
      return {
        status: migration.status === "CONFLICTED" ? "CONFLICTED" : migration.status === "PROVEN" ? "PROVEN" : "UNKNOWN",
        value: canonicalEvidence,
        reason: migration.status === "PROVEN" ? null : "CANONICAL_POOL_FOUND_BUT_GRADUATION_TRANSACTION_NOT_PROVEN",
      };
    } catch (error) {
      return {
        status: "UNKNOWN",
        value: null,
        reason: error instanceof Error ? error.message : "CANONICAL_PUMPSWAP_READ_FAILED",
      };
    }
  }

  public async readTradeActivity(poolAddress: string): Promise<PumpActivityEvidence> {
    const limit = Math.min(this.options.tradeLimit ?? 100, 100);
    try {
      const signatures = await this.rpc.request<readonly RpcSignature[]>("getSignaturesForAddress", [
        poolAddress,
        { limit, commitment: "confirmed" },
      ]);
      const observations: PumpTradeObservation[] = [];
      for (const item of signatures.filter((item) => item.err === null)) {
        const transaction = await this.rpc.request<RpcTransaction | null>("getTransaction", [
          item.signature,
          { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 1 },
        ]);
        const logs = transaction?.meta?.logMessages ?? [];
        for (let index = 0; index < logs.length; index += 1) {
          const parsed = parsePumpSwapTradeEvent(logs[index] ?? "", poolAddress);
          if (parsed === null) continue;
          observations.push({
            ...parsed,
            signature: item.signature,
            slot: BigInt(transaction?.slot ?? item.slot),
            timestamp: parsed.timestamp ?? transaction?.blockTime ?? item.blockTime,
          });
        }
      }
      const deduped = [...new Map(observations.map((item) => [`${item.signature}:${item.side}:${item.baseAmount.toString()}`, item])).values()]
        .sort((left, right) => Number(left.slot - right.slot));
      const first = deduped.at(0)?.timestamp;
      const last = deduped.at(-1)?.timestamp;
      return {
        status: deduped.length === 0 ? "INSUFFICIENT_DATA" : "AVAILABLE",
        observationWindow: {
          first: first === undefined || first === null ? null : new Date(first * 1_000).toISOString(),
          last: last === undefined || last === null ? null : new Date(last * 1_000).toISOString(),
        },
        sampleCount: deduped.length,
        trades: deduped,
        source: deduped.length === 0 ? "UNAVAILABLE" : "PUMPSWAP_EVENTS",
        reason: deduped.length === 0 ? "NO_DECODED_PUMPSWAP_BUY_SELL_EVENTS_IN_BOUNDED_WINDOW" : null,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        observationWindow: { first: null, last: null },
        sampleCount: 0,
        trades: [],
        source: "UNAVAILABLE",
        reason: error instanceof Error ? error.message : "PUMPSWAP_ACTIVITY_READ_FAILED",
      };
    }
  }

  private async readGlobalConfig(): Promise<{ readonly lpFeeBps: bigint; readonly protocolFeeBps: bigint; readonly creatorFeeBps: bigint } | null> {
    try {
      const address = PumpSwapReader.deriveGlobalConfig();
      const account = await this.rpc.request<RpcAccountInfo>("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
      if (account.value === null || !isBase64AccountData(account.value.data)) return null;
      const bytes = decodeBase64(account.value.data[0]);
      if (bytes.length < 57) return null;
      return {
        lpFeeBps: readU64(bytes, 40),
        protocolFeeBps: readU64(bytes, 48),
        creatorFeeBps: bytes.length >= 321 ? readU64(bytes, 313) : 0n,
      };
    } catch {
      return null;
    }
  }

  private async readMigrationEvidence(poolAddress: string): Promise<CanonicalPumpMarketEvidence["graduationEvidence"]> {
    try {
      const limit = Math.min(this.options.historyLimit ?? 1_000, 1_000);
      const signatures = await this.rpc.request<readonly RpcSignature[]>("getSignaturesForAddress", [poolAddress, { limit, commitment: "confirmed" }]);
      // The migration/create transaction is the oldest pool transaction. Read
      // only a bounded prefix from the oldest end; do not walk unbounded pool
      // history merely to prove origin.
      for (const item of [...signatures].reverse().filter((candidate) => candidate.err === null).slice(0, 10)) {
        const transaction = await this.rpc.request<RpcTransaction | null>("getTransaction", [
          item.signature,
          { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 1 },
        ]);
        const logs = transaction?.meta?.logMessages ?? [];
        const hasPumpProgram = logs.some((line) => line.includes(`Program ${PUMP_FUN_PROGRAM_ID} invoke`));
        const hasMigration = logs.some((line) => /instruction:\s*migrate\b/i.test(line));
        if (hasPumpProgram && hasMigration) {
          return {
            status: "PROVEN",
            migrationSignature: item.signature,
            slot: BigInt(transaction?.slot ?? item.slot),
            source: "PUMPSWAP_CANONICAL_POOL_AND_MIGRATE_TX",
            evidenceIds: [`solana:tx:${item.signature}`, `solana:pool:${poolAddress}`],
          };
        }
      }
      return {
        status: "UNKNOWN",
        migrationSignature: null,
        slot: null,
        source: "UNAVAILABLE",
        evidenceIds: [`solana:pool:${poolAddress}`],
      };
    } catch {
      return {
        status: "UNKNOWN",
        migrationSignature: null,
        slot: null,
        source: "UNAVAILABLE",
        evidenceIds: [`solana:pool:${poolAddress}`],
      };
    }
  }

  private async readLargestOwners(
    mint: string,
    supply: bigint | null,
    pool: PumpSwapPoolState,
  ): Promise<(PumpHolderEvidence & { readonly evidenceIds: readonly string[]; readonly largestBurnPct: number | null }) | null> {
    if (supply === null || supply <= 0n) return null;
    try {
      const largest = await this.rpc.request<{ readonly context: { readonly slot: number }; readonly value: readonly { readonly address: string; readonly amount: string }[] }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
      const addresses = largest.value.map((item) => item.address);
      const resolved = await this.rpc.request<RpcMultipleAccounts>("getMultipleAccounts", [addresses, { encoding: "jsonParsed", commitment: "confirmed" }]);
      const owners = resolved.value.map((account) => parsedTokenOwner(account));
      const excludedSystemOwners: { owner: string; evidence: string }[] = [];
      const excluded = new Set([SOLANA_SYSTEM_PROGRAM_ID, SOLANA_INCINERATOR_ADDRESS, pool.pool, pool.creator, PUMPSWAP_PROGRAM_ID, PUMP_FUN_PROGRAM_ID]);
      const byOwner = new Map<string, bigint>();
      let unresolved = 0n;
      let largestBurnPct: number | null = null;
      largest.value.forEach((item, index) => {
        const amount = BigInt(item.amount);
        const owner = owners[index] ?? null;
        if (owner === null) {
          unresolved += amount;
          return;
        }
        if (owner === SOLANA_INCINERATOR_ADDRESS) largestBurnPct = pct(amount, supply);
        if (excluded.has(owner)) {
          excludedSystemOwners.push({ owner, evidence: owner === pool.pool ? "canonical-pumpswap-pool" : owner === pool.creator ? "canonical-pump-pool-authority" : "verified-system-or-program-address" });
          return;
        }
        byOwner.set(owner, (byOwner.get(owner) ?? 0n) + amount);
      });
      const ownerAmounts = [...byOwner.values()].sort((left, right) => (left === right ? 0 : left > right ? -1 : 1));
      return {
        status: "AVAILABLE",
        supply,
        largestRawTokenAccountPct: largest.value.length === 0 ? null : pct(BigInt(largest.value[0]!.amount), supply),
        largestResolvedOwnerPct: ownerAmounts.length === 0 ? null : pct(ownerAmounts[0]!, supply),
        top10ResolvedOwnerPct: pct(ownerAmounts.slice(0, 10).reduce((sum, amount) => sum + amount, 0n), supply),
        unresolvedConcentrationPct: pct(unresolved, supply),
        resolvedAccounts: owners.filter((owner): owner is string => owner !== null).length,
        excludedSystemOwners,
        reason: null,
        evidenceIds: [`solana:largest-accounts:${mint}`, `solana:owner-resolution:${mint}`],
        largestBurnPct,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        supply,
        largestRawTokenAccountPct: null,
        largestResolvedOwnerPct: null,
        top10ResolvedOwnerPct: null,
        unresolvedConcentrationPct: null,
        resolvedAccounts: 0,
        excludedSystemOwners: [],
        reason: error instanceof Error ? error.message : "OWNER_RESOLUTION_FAILED",
        evidenceIds: [],
        largestBurnPct: null,
      };
    }
  }
}

function classifyLpControl(
  pool: PumpSwapPoolState,
  lpMint: { readonly supply: bigint; readonly mintAuthority: string | null } | null,
  largest: (PumpHolderEvidence & { readonly largestBurnPct: number | null }) | null,
  migrationStatus: PumpProofStatus,
): PumpLpControl {
  if (migrationStatus === "CONFLICTED") return "CONFLICTED";
  if (lpMint === null || largest === null) return "UNKNOWN";
  if (migrationStatus !== "PROVEN") return "UNKNOWN";
  // Pool::lp_supply deliberately excludes burns and lock-ups.  It is not a
  // burn proof; the live LP mint supply and resolved LP holders are.
  if (lpMint.supply === 0n || ((largest.largestBurnPct ?? 0) >= 99.999 && largest.largestResolvedOwnerPct === null))
    return "BURNED";
  if (largest.largestResolvedOwnerPct !== null) return "CONFLICTED";
  if (lpMint.mintAuthority === null) return "IMMUTABLE_MIGRATION_CONTROL";
  return "UNKNOWN";
}

function buildPriceEvidence(
  pool: PumpSwapPoolState,
  baseReserve: bigint,
  rawQuoteReserve: bigint,
  effectiveQuoteReserve: bigint,
  feeBps: bigint | null,
): PumpSwapPriceEvidence {
  if (baseReserve <= 0n || effectiveQuoteReserve <= 0n || feeBps === null || feeBps >= 10_000n)
    return {
      status: "UNAVAILABLE",
      priceQuotePerBase: null,
      baseReserve,
      rawQuoteReserve,
      effectiveQuoteReserve,
      feeBps,
      formulaVersion: "pumpswap-constant-product-effective-quote-v1",
      slot: pool.slot,
      evidenceHash: pool.rawEvidenceHash,
      reason: "DIRECT_PRICE_REQUIRES_POSITIVE_EFFECTIVE_RESERVES_AND_LIVE_FEE_CONFIG",
    };
  return {
    status: "AVAILABLE",
    priceQuotePerBase: `${effectiveQuoteReserve.toString()}/${baseReserve.toString()}`,
    baseReserve,
    rawQuoteReserve,
    effectiveQuoteReserve,
    feeBps,
    formulaVersion: "pumpswap-constant-product-effective-quote-v1",
    slot: pool.slot,
    evidenceHash: pool.rawEvidenceHash,
    reason: null,
  };
}

function buildDepthEvidence(
  pool: PumpSwapPoolState,
  baseReserve: bigint,
  effectiveQuoteReserve: bigint,
  feeBps: bigint | null,
): PumpSwapDepthEvidence {
  const unavailable = (reason: string): PumpSwapDepthEvidence => ({
    status: "UNAVAILABLE",
    quoteAsset: pool.quoteMint,
    feeBps,
    buy1: null,
    sell1: null,
    buy2: null,
    sell2: null,
    buy5: null,
    sell5: null,
    formulaVersion: "pumpswap-executable-quote-simulation-v1",
    provenance: "UNAVAILABLE",
    reason,
  });
  if (baseReserve <= 0n || effectiveQuoteReserve <= 0n || feeBps === null || feeBps >= 10_000n)
    return unavailable("DIRECT_DEPTH_REQUIRES_POSITIVE_EFFECTIVE_RESERVES_AND_LIVE_FEE_CONFIG");
  return {
    status: "AVAILABLE",
    quoteAsset: pool.quoteMint,
    feeBps,
    buy1: depthForMove(baseReserve, effectiveQuoteReserve, 100n, feeBps, true),
    sell1: depthForMove(baseReserve, effectiveQuoteReserve, 100n, feeBps, false),
    buy2: depthForMove(baseReserve, effectiveQuoteReserve, 200n, feeBps, true),
    sell2: depthForMove(baseReserve, effectiveQuoteReserve, 200n, feeBps, false),
    buy5: depthForMove(baseReserve, effectiveQuoteReserve, 500n, feeBps, true),
    sell5: depthForMove(baseReserve, effectiveQuoteReserve, 500n, feeBps, false),
    formulaVersion: "pumpswap-executable-quote-simulation-v1",
    provenance: "DIRECT_POOL_STATE",
    reason: null,
  };
}

function depthForMove(baseReserve: bigint, quoteReserve: bigint, moveBps: bigint, feeBps: bigint, buy: boolean): bigint {
  const WAD = 10n ** 18n;
  const ratio = buy ? WAD + (WAD * moveBps) / 10_000n : WAD - (WAD * moveBps) / 10_000n;
  const targetBase = isqrt((baseReserve * baseReserve * WAD) / ratio);
  const baseDelta = buy ? baseReserve > targetBase ? baseReserve - targetBase : 0n : targetBase > baseReserve ? targetBase - baseReserve : 0n;
  if (baseDelta === 0n) return 0n;
  if (buy) {
    const gross = (baseDelta * quoteReserve) / (baseReserve - baseDelta);
    return ceilDiv(gross * 10_000n, 10_000n - feeBps);
  }
  const afterFee = (baseDelta * (10_000n - feeBps)) / 10_000n;
  return (afterFee * quoteReserve) / (baseReserve + afterFee);
}

export function parsePumpSwapTradeEvent(line: string, poolAddress: string): Omit<PumpTradeObservation, "signature" | "slot" | "timestamp"> & { readonly timestamp: number | null } | null {
  if (!line.startsWith("Program data: ")) return null;
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(line.slice("Program data: ".length));
  } catch {
    return null;
  }
  if (bytes.length < 184) return null;
  const discriminator = bytes.slice(0, 8);
  const side = equalBytes(discriminator, fromHex(PUMPSWAP_BUY_EVENT_DISCRIMINATOR))
    ? "BUY"
    : equalBytes(discriminator, fromHex(PUMPSWAP_SELL_EVENT_DISCRIMINATOR))
      ? "SELL"
      : null;
  if (side === null) return null;
  const eventPool = encodeBase58(bytes.slice(120, 152));
  if (eventPool !== poolAddress) return null;
  const user = encodeBase58(bytes.slice(152, 184));
  return {
    side,
    wallet: user,
    baseAmount: readU64(bytes, 16),
    quoteAmount: readU64(bytes, 64),
    timestamp: toSafeNumber(readI64(bytes, 8)),
    pool: eventPool,
    source: side === "BUY" ? "PUMPSWAP_BUY_EVENT" : "PUMPSWAP_SELL_EVENT",
  };
}

function parsedMint(account: RpcAccount | null | undefined): { readonly supply: bigint; readonly decimals: number; readonly mintAuthority: string | null; readonly freezeAuthority: string | null } | null {
  const parsed = parsedInfo(account);
  const tokenAmount = objectValue(parsed, "tokenAmount");
  const supply = stringValue(parsed, "supply") ?? stringValue(tokenAmount, "amount");
  const decimals = numberValue(parsed, "decimals") ?? numberValue(tokenAmount, "decimals");
  if (supply === null || decimals === null) return null;
  return {
    supply: BigInt(supply),
    decimals,
    mintAuthority: stringValue(parsed, "mintAuthority"),
    freezeAuthority: stringValue(parsed, "freezeAuthority"),
  };
}

function parsedTokenAmount(account: RpcAccount | null | undefined): bigint | null {
  const parsed = parsedInfo(account);
  const tokenAmount = objectValue(parsed, "tokenAmount");
  const amount = stringValue(tokenAmount, "amount") ?? stringValue(parsed, "amount");
  return amount === null ? null : BigInt(amount);
}

function parsedTokenOwner(account: RpcAccount | null | undefined): string | null {
  return stringValue(parsedInfo(account), "owner");
}

function parsedInfo(account: RpcAccount | null | undefined): Record<string, unknown> | null {
  if (account === null || account === undefined || Array.isArray(account.data)) return null;
  const parsed = (account.data as { readonly parsed?: unknown }).parsed;
  if (!isRecord(parsed)) return null;
  const info = parsed.info;
  return isRecord(info) ? info : null;
}

function objectValue(value: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const candidate = value?.[key];
  return isRecord(candidate) ? candidate : null;
}

function stringValue(value: Record<string, unknown> | null, key: string): string | null {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function numberValue(value: Record<string, unknown> | null, key: string): number | null {
  const candidate = value?.[key];
  return typeof candidate === "number" ? candidate : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBase64AccountData(value: RpcAccount["data"]): value is readonly [string, string] {
  return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string";
}

function pct(amount: bigint, supply: bigint): number {
  return Number((amount * 10_000_000n) / supply) / 100_000;
}

function toSafeNumber(value: bigint): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new Error("invalid Solana public key");
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("invalid Solana public key character");
    number = number * 58n + BigInt(digit);
  }
  const result: number[] = [];
  while (number > 0n) {
    result.push(Number(number & 0xffn));
    number >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    result.push(0);
  }
  const bytes = Uint8Array.from(result.reverse());
  if (bytes.length !== 32) throw new Error("Solana public key must decode to 32 bytes");
  return bytes;
}

function encodeBase58(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  const result: string[] = [];
  while (number > 0n) {
    result.push(alphabet[Number(number % 58n)]!);
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result.push("1");
  }
  return result.reverse().join("") || "1";
}

function findProgramAddress(seeds: readonly Uint8Array[], programId: string): { readonly address: string; readonly bump: number } {
  if (seeds.some((seed) => seed.length > 32)) throw new Error("PDA seed exceeds 32 bytes");
  const program = decodeBase58(programId);
  for (let bump = 255; bump >= 0; bump -= 1) {
    const bytes = concatBytes(...seeds, Uint8Array.of(bump), program, PDA_MARKER);
    const hash = sha256Bytes(bytes);
    if (!isEd25519Point(hash)) return { address: encodeBase58(hash), bump };
  }
  throw new Error("PDA_NOT_FOUND");
}

function isEd25519Point(encoded: Uint8Array): boolean {
  if (encoded.length !== 32) return false;
  const sign = (encoded[31]! & 0x80) !== 0;
  const yBytes = encoded.slice();
  yBytes[31] = yBytes[31]! & 0x7f;
  const y = littleEndianToBigInt(yBytes);
  if (y >= ED25519_P) return false;
  const y2 = mod(y * y, ED25519_P);
  const x2 = mod((y2 - 1n) * modInverse(mod(ED25519_D * y2 + 1n, ED25519_P), ED25519_P), ED25519_P);
  let x = modPow(x2, (ED25519_P + 3n) / 8n, ED25519_P);
  if (mod(x * x - x2, ED25519_P) !== 0n) x = mod(x * ED25519_SQRT_M1, ED25519_P);
  if (mod(x * x - x2, ED25519_P) !== 0n) return false;
  return !(x === 0n && sign);
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

function sha256Hex(bytes: Uint8Array): string {
  return `0x${Buffer.from(sha256Bytes(bytes)).toString("hex")}`;
}

function littleEndianToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) result = result * 256n + BigInt(bytes[index]!);
  return result;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  let result = 0n;
  for (let index = 7; index >= 0; index -= 1) result = (result << 8n) | BigInt(bytes[offset + index]!);
  if (result > MAX_U64) throw new Error("u64 overflow");
  return result;
}

function readI64(bytes: Uint8Array, offset: number): bigint {
  const unsigned = readU64(bytes, offset);
  return unsigned >= (1n << 63n) ? unsigned - (1n << 64n) : unsigned;
}

function readI128(bytes: Uint8Array, offset: number): bigint {
  let unsigned = 0n;
  for (let index = 15; index >= 0; index -= 1) unsigned = (unsigned << 8n) | BigInt(bytes[offset + index]!);
  return unsigned > MAX_I128 ? unsigned - (1n << 128n) : unsigned < MIN_I128 ? MIN_I128 : unsigned;
}

function u16le(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function fromHex(value: string): Uint8Array {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return output;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let current = mod(base, modulus);
  let power = exponent;
  while (power > 0n) {
    if ((power & 1n) === 1n) result = mod(result * current, modulus);
    current = mod(current * current, modulus);
    power >>= 1n;
  }
  return result;
}

function modInverse(value: bigint, modulus: bigint): bigint {
  return modPow(value, modulus - 2n, modulus);
}

function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("sqrt of negative value");
  if (value < 2n) return value;
  const bitLength = value.toString(2).length;
  let x0 = 1n << BigInt(Math.ceil(bitLength / 2));
  if (x0 <= 0n) x0 = 1n;
  let x1 = (x0 + value / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }
  return x0;
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return value === 0n ? 0n : (value + divisor - 1n) / divisor;
}
