import fs from "node:fs";
import { createPublicClient, http } from "viem";
import { keccak_256 } from "@noble/hashes/sha3.js";

const rpc = "https://rpc.testnet.arc.io";
const suite = {
  QualificationRegistry: [
    "0xc63ab21db792767f29750ce5d3f5bbf73e9758cd",
    "0x5f4193cbbcaf64175b2bb3dbe46dd6c7733c59bd",
  ],
  MarketRegistry: [
    "0xf36fdec9688250afc79040f0f1c8079232fdad0d",
    "0x4ea3fbb41962d0a3ec28c570656ea9d5ac1904bb",
  ],
  OracleRouter: [
    "0x2cab215a4eda6e4a38d94775e6fb91b6d2a5a25b",
    "0xfdc85c3a13186e9be0ad63c34b5162de25bd39a5",
  ],
  RiskConfig: [
    "0x6c6c4a62ef80863d4bf133a18b599234bface8c0",
    "0x3f9a6bfd2019b760d85eaf2ce0827534d58e65ad",
  ],
  USDCMarginVault: [
    "0xac2c04fd72bc971ea5a0cf7b2a0031d60d1f8bdb",
    "0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab",
  ],
  InsuranceFund: [
    "0x49264e8002a6d56553305ed3a7b52831571f2aa9",
    "0x131ce3346eb5e15a3ae3c1cba2cd93d54dc6877b",
  ],
  PerpEngine: [
    "0x3c6489c312fde0009842fb1470705ae2971b19f5",
    "0xbd2c3ad91799110adf647493acbaa1f63a40514c",
  ],
  PublicLPVault: [
    "0xffb36018800aeaeb16fc2b04d26084f5f8774589",
    "0x826892d52172ddef07f2927ba67493465cf54964",
  ],
  ADLController: [
    "0x7d7703b70f7e78a9ee1773fa4442f7b5b26c6440",
    "0xca600bcd65de31d65ee198a82d5d51d50fa4b841",
  ],
  ProtocolTimelock: [
    "0xde0c8dbd58d0eb2f742aaab167eacb2f1fe9c10e",
    "0xec9eed7f03a945ca9a810ed0db87c6dc6f23901f",
  ],
} as const;

type ImmutableReferences = Record<string, readonly { start: number; length: number }[]>;

function normalize(code: string, references: ImmutableReferences): string {
  const bytes = Buffer.from(code.slice(2), "hex");
  for (const ranges of Object.values(references)) {
    for (const range of ranges) bytes.fill(0, range.start, range.start + range.length);
  }
  return `0x${bytes.toString("hex")}`;
}

function hash(code: string): string {
  return `0x${Buffer.from(keccak_256(Buffer.from(code.slice(2), "hex"))).toString("hex")}`;
}

async function main(): Promise<void> {
  const client = createPublicClient({ transport: http(rpc) });
  const rows: unknown[] = [];
  for (const [contract, addresses] of Object.entries(suite)) {
    const artifact = JSON.parse(
      fs.readFileSync(`out/${contract}.sol/${contract}.json`, "utf8"),
    ) as { deployedBytecode: { object: string; immutableReferences?: ImmutableReferences } };
    const references = artifact.deployedBytecode.immutableReferences ?? {};
    const expected = normalize(artifact.deployedBytecode.object, references);
    const stress = normalize(
      (await client.getBytecode({ address: addresses[0] })) ?? "0x",
      references,
    );
    const product = normalize(
      (await client.getBytecode({ address: addresses[1] })) ?? "0x",
      references,
    );
    rows.push({
      contract,
      stressAddress: addresses[0],
      productAddress: addresses[1],
      immutableSlots: Object.values(references).flat().length,
      expectedHash: hash(expected),
      stressHash: hash(stress),
      productHash: hash(product),
      stressMatchesExpected: stress === expected,
      productMatchesExpected: product === expected,
      productMatchesStress: product === stress,
    });
  }
  console.log(JSON.stringify({ parity: rows.every((row) => {
    const value = row as Record<string, unknown>;
    return value.stressMatchesExpected && value.productMatchesExpected && value.productMatchesStress;
  }) ? "PASS" : "FAIL", contracts: rows }));
}

await main();
