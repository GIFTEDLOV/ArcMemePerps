import { createPublicClient, http, formatUnits } from 'viem';

const client = createPublicClient({ transport: http('https://rpc.mainnet.arc.io') });
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function run() {
  const addrs = [
    '0xB65685037041Ff56574a53FC49B1F5dB88ABe043',
    '0x456A3ab835Bea90b42FF207B6c42BCE0BFF3e833',
    '0x5b8d47EbB56D725688f4cE62cb6c005e90f94f20'
  ];
  for (const a of addrs) {
    try {
      const bal = await client.getBalance({ address: a as any });
      let usdc: bigint | null = null;
      try {
          usdc = await client.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [a as any],
        });
      } catch (e) {}
      console.log(`Address: ${a}`);
      console.log(`  Native Gas: ${formatUnits(bal, 18)} USDC`);
      console.log(`  USDC: ${usdc === null ? 'unavailable' : `${formatUnits(usdc, 6)} USDC`}\n`);
    } catch (e) {
      console.log(`Error checking ${a}:`, e);
    }
  }
}
run();
