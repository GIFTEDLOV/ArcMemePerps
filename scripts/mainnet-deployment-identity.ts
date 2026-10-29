import { isEvmAddress } from "../packages/shared/src/arc-deployment";
import type { Address } from "viem";

type ManifestRecord = Readonly<Record<string, unknown>>;

/**
 * Resolve the deployer whose retained role the Mainnet verifier checks.
 * The deployed-contract manifest is authoritative; a pending deployment plan
 * must not silently substitute a different address.
 */
export function resolveMainnetDeployer(
  manifestDeployer: unknown,
  configuredOverride?: string,
): Address {
  if (!isEvmAddress(manifestDeployer)) {
    throw new Error("INVALID_MAINNET_DEPLOYER_IN_CONTRACTS_MANIFEST");
  }

  const deployed = manifestDeployer.trim();
  const override = configuredOverride?.trim();
  if (override) {
    if (!isEvmAddress(override)) {
      throw new Error("INVALID_MAINNET_DEPLOYER_OVERRIDE");
    }
    if (override.trim().toLowerCase() !== deployed.toLowerCase()) {
      throw new Error("MAINNET_DEPLOYER_OVERRIDE_MISMATCH");
    }
  }

  return deployed as Address;
}

export function resolveMainnetContractAddress(manifest: unknown, name: string): Address {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error("INVALID_MAINNET_CONTRACTS_MANIFEST");
  }

  const record = manifest as ManifestRecord;
  const addressMap = record.deployedAddresses;
  const addressFromMap =
    typeof addressMap === "object" && addressMap !== null && !Array.isArray(addressMap)
      ? (addressMap as ManifestRecord)[name]
      : undefined;
  const contractEntries = Array.isArray(record.contracts) ? record.contracts : [];
  const deployedEntry = contractEntries.find(
    (entry): entry is ManifestRecord =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.name === name,
  );
  const address = addressFromMap ?? deployedEntry?.address;
  if (!isEvmAddress(address)) throw new Error(`MISSING_OR_INVALID_MAINNET_CONTRACT:${name}`);
  return address as Address;
}

export function resolveMainnetDeploymentBlockRange(manifest: unknown): {
  first: bigint;
  last: bigint;
} {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error("INVALID_MAINNET_CONTRACTS_MANIFEST");
  }

  const record = manifest as ManifestRecord;
  const blocks = record.deploymentBlocks;
  if (typeof blocks === "object" && blocks !== null && !Array.isArray(blocks)) {
    const { first, last } = blocks as ManifestRecord;
    if (isBlockNumber(first) && isBlockNumber(last)) {
      const firstBlock = BigInt(first);
      const lastBlock = BigInt(last);
      if (firstBlock <= lastBlock) return { first: firstBlock, last: lastBlock };
    }
  }

  const receipts = record.receipts;
  const receiptBlocks =
    typeof receipts === "object" && receipts !== null && !Array.isArray(receipts)
      ? Object.values(receipts as ManifestRecord).flatMap((receipt) => {
          if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) return [];
          const blockNumber = (receipt as ManifestRecord).blockNumber;
          return isBlockNumber(blockNumber) ? [BigInt(blockNumber)] : [];
        })
      : [];
  if (receiptBlocks.length === 0) throw new Error("MAINNET_DEPLOYMENT_BLOCK_RANGE_MISSING");
  return {
    first: receiptBlocks.reduce((minimum, block) => (block < minimum ? block : minimum)),
    last: receiptBlocks.reduce((maximum, block) => (block > maximum ? block : maximum)),
  };
}

function isBlockNumber(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

