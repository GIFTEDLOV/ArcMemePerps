import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, defineChain, encodeFunctionData, keccak256, type Address, type Hash } from "viem";
import { WINNER_CONFIG } from "./winner-config";
import type { Pretrade, WalletState } from "./winner-types";

type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown>; on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Eip1193Provider } }

const arc = defineChain({ id: WINNER_CONFIG.chainId, name: WINNER_CONFIG.chainName, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [WINNER_CONFIG.rpcUrl] } } });
const erc20Abi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }] as const;
const vaultAbi = [{ type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] }] as const;
const engineAbi = [{ type: "function", name: "submitOrder", stateMutability: "nonpayable", inputs: [{ name: "marketId", type: "bytes32" }, { name: "action", type: "uint8" }, { name: "isLong", type: "bool" }, { name: "sizeDelta", type: "uint256" }, { name: "collateralDelta", type: "uint256" }, { name: "acceptablePrice", type: "uint256" }, { name: "expiry", type: "uint64" }], outputs: [] }] as const;
function injected() { return typeof window !== "undefined" ? window.ethereum ?? null : null; }
function asChainId(value: unknown) { if (typeof value !== "string" && typeof value !== "number") return null; const result = typeof value === "string" ? Number.parseInt(value, value.startsWith("0x") ? 16 : 10) : value; return Number.isFinite(result) ? result : null; }

export interface WalletActions { state: WalletState; connect: () => Promise<void>; disconnect: () => void; switchToArc: () => Promise<void>; submitPlan: (plan: Pretrade) => Promise<{ approval: Hash; deposit: Hash; order: Hash }> }

export function useWallet(): WalletActions {
  const [state, setState] = useState<WalletState>({ address: null, chainId: null, status: "DISCONNECTED", error: null });
  const refresh = useCallback(async () => { const provider = injected(); if (!provider) return; const accounts = await provider.request({ method: "eth_accounts" }) as string[]; const chainId = asChainId(await provider.request({ method: "eth_chainId" })); const address = accounts[0] ? accounts[0] as `0x${string}` : null; setState({ address, chainId, status: !address ? "DISCONNECTED" : chainId === WINNER_CONFIG.chainId ? "CONNECTED" : "WRONG_NETWORK", error: null }); }, []);
  useEffect(() => { void refresh(); const provider = injected(); if (!provider?.on) return; const onAccounts = () => void refresh(); const onChain = () => void refresh(); provider.on("accountsChanged", onAccounts); provider.on("chainChanged", onChain); return () => { provider.removeListener?.("accountsChanged", onAccounts); provider.removeListener?.("chainChanged", onChain); }; }, [refresh]);
  const connect = useCallback(async () => { const provider = injected(); if (!provider) { setState((s) => ({ ...s, status: "REJECTED", error: "NO_WALLET" })); return; } setState((s) => ({ ...s, status: "CONNECTING", error: null })); try { await provider.request({ method: "eth_requestAccounts" }); await refresh(); } catch (error) { setState((s) => ({ ...s, status: "REJECTED", error: error instanceof Error ? error.message : "WALLET_REJECTED" })); } }, [refresh]);
  const switchToArc = useCallback(async () => {
    const provider = injected();
    if (!provider) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${WINNER_CONFIG.chainId.toString(16)}` }],
      });
      await refresh();
    } catch (switchError: unknown) {
      const err = switchError as { code?: number; message?: string };
      if (err?.code === 4902 || String(err?.message).includes("4902") || String(err?.message).toLowerCase().includes("unrecognized")) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: `0x${WINNER_CONFIG.chainId.toString(16)}`,
              chainName: WINNER_CONFIG.chainName,
              nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
              rpcUrls: [WINNER_CONFIG.rpcUrl],
              blockExplorerUrls: [WINNER_CONFIG.explorerUrl],
            }],
          });
          await refresh();
          return;
        } catch (addError) {
          setState((s) => ({ ...s, status: "WRONG_NETWORK", error: addError instanceof Error ? addError.message : "NETWORK_ADD_REJECTED" }));
          return;
        }
      }
      setState((s) => ({ ...s, status: "WRONG_NETWORK", error: switchError instanceof Error ? switchError.message : "NETWORK_SWITCH_REJECTED" }));
    }
  }, [refresh]);
  const disconnect = useCallback(() => setState({ address: null, chainId: null, status: "DISCONNECTED", error: null }), []);
  const submitPlan = useCallback(async (plan: Pretrade) => { const provider = injected(); if (WINNER_CONFIG.deploymentStatus !== "DEPLOYED_ZERO_MARKETS") throw new Error("ARC_DEPLOYMENT_PENDING"); if (!WINNER_CONFIG.contracts.USDCMarginVault || !WINNER_CONFIG.contracts.PerpEngine) throw new Error("MAINNET_CONTRACTS_UNAVAILABLE"); if (!provider || !state.address || state.chainId !== WINNER_CONFIG.chainId) throw new Error("WALLET_OR_NETWORK_NOT_READY"); if (!plan.acceptablePriceWad || !plan.sizeUsdWad || !plan.collateralUsdUsdc || !plan.expiry || !plan.account) throw new Error("PLAN_FIELDS_UNAVAILABLE"); const client = createWalletClient({ account: state.address, chain: arc, transport: custom(provider) }); const vault = WINNER_CONFIG.contracts.USDCMarginVault as Address; const collateral = BigInt(plan.collateralUsdUsdc); const action = plan.action === "OPEN" ? 0 : plan.action === "INCREASE" ? 1 : plan.action === "DECREASE" ? 2 : 3; const approval = await client.writeContract({ address: WINNER_CONFIG.usdc, abi: erc20Abi, functionName: "approve", args: [vault, collateral] }); const deposit = await client.writeContract({ address: vault, abi: vaultAbi, functionName: "deposit", args: [collateral] }); const order = await client.writeContract({ address: WINNER_CONFIG.contracts.PerpEngine as Address, abi: engineAbi, functionName: "submitOrder", args: [plan.marketId as `0x${string}`, action, plan.side === "LONG", BigInt(plan.sizeUsdWad), collateral, BigInt(plan.acceptablePriceWad), BigInt(plan.expiry)] }); return { approval, deposit, order }; }, [state.address, state.chainId]);
  return useMemo(() => ({ state, connect, disconnect, switchToArc, submitPlan }), [state, connect, disconnect, switchToArc, submitPlan]);
}

export function planHash(plan: Pretrade): string { const action = plan.action === "OPEN" ? 0 : plan.action === "INCREASE" ? 1 : plan.action === "DECREASE" ? 2 : 3; const calldata = encodeFunctionData({ abi: engineAbi, functionName: "submitOrder", args: [plan.marketId as `0x${string}`, action, plan.side === "LONG", BigInt(plan.sizeUsdWad ?? "0"), BigInt(plan.collateralUsdUsdc ?? "0"), BigInt(plan.acceptablePriceWad ?? "0"), BigInt(plan.expiry ?? "0")] }); return keccak256(calldata); }
