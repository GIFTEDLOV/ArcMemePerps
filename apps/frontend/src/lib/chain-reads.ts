export async function readUsdcBalance(rpcUrl: string, tokenAddress: string, ownerAddress: string): Promise<string> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress) || !/^0x[0-9a-fA-F]{40}$/.test(ownerAddress)) {
    throw new Error("Invalid token or wallet address.");
  }
  const accountWord = ownerAddress.slice(2).toLowerCase().padStart(64, "0");
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: tokenAddress, data: `0x70a08231${accountWord}` }, "latest"] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "RPC call failed.");
  if (typeof payload.result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(payload.result)) {
    throw new Error("RPC returned an invalid USDC balance result.");
  }
  const cents = BigInt(payload.result) / 10_000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}
