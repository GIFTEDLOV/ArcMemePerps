import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, formatUnits } from "viem";

const names = [
  "QualificationRegistry",
  "MarketRegistry",
  "OracleRouter",
  "RiskConfig",
  "InsuranceFund",
  "PerpEngine",
  "PublicLPVault",
  "ADLController",
  "ProtocolTimelock",
  "USDCMarginVault"
];

for (const n of names) {
  const p = resolve(process.cwd(), `out/${n}.sol/${n}.json`);
  if (!existsSync(p)) {
    console.error(`Artifact missing for: ${n} at ${p}`);
    process.exit(1);
  }
  const art = JSON.parse(readFileSync(p, "utf8"));
  if (!art.abi || !art.bytecode?.object) {
    console.error(`Artifact invalid for: ${n}`);
    process.exit(1);
  }
}
console.log("All 10 contract artifacts verified successfully!");

async function checkNetwork() {
  const client = createPublicClient({ transport: http("https://rpc.mainnet.arc.io") });
  const blockNumber = await client.getBlockNumber();
  const gasPrice = await client.getGasPrice();
  const deployer = "0xB65685037041Ff56574a53FC49B1F5dB88ABe043";
  const bal = await client.getBalance({ address: deployer });
  console.log(`Arc Mainnet Block: ${blockNumber}`);
  console.log(`Gas Price: ${formatUnits(gasPrice, 18)} USDC per gas unit (${gasPrice.toString()} base units)`);
  console.log(`Deployer ${deployer} native gas balance: ${formatUnits(bal, 18)} USDC`);
}

checkNetwork().catch(console.error);
