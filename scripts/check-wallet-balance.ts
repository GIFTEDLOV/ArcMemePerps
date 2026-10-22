import { createPublicClient, http, formatEther, formatUnits } from 'viem';

const ARC_RPC = process.env.ARC_RPC_URL || 'https://rpc.mainnet.arc.io';
const WALLET_ADDRESS = (process.env.ARC_DEPLOYER_ADDRESS || '0xB65685037041Ff56574a53FC49B1F5dB88ABe043') as `0x${string}`;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`;

const arcChain = {
  id: 5042,
  name: 'Arc Mainnet',
  network: 'arc-mainnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC] },
    public: { http: [ARC_RPC] },
  },
};

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function check() {
  const client = createPublicClient({
    chain: arcChain,
    transport: http(ARC_RPC),
  });

  const nativeBalance = await client.getBalance({ address: WALLET_ADDRESS });
  
  let usdcBalance = 0n;
  try {
    usdcBalance = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [WALLET_ADDRESS],
    });
  } catch (e) {
    // contract read might fail if no usdc deployed at mock address yet or custom token
  }

  console.log(JSON.stringify({
    address: WALLET_ADDRESS,
    nativeGasBalance: formatEther(nativeBalance) + ' ARC',
    usdcBalance: formatUnits(usdcBalance, 6) + ' USDC',
    rawNative: nativeBalance.toString(),
    rawUsdc: usdcBalance.toString()
  }, null, 2));
}

check().catch(console.error);
