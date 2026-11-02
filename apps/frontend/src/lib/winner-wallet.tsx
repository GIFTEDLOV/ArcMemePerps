import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, defineChain, encodeFunctionData, http, keccak256, type Address, type Hash } from "viem";
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

export interface WalletActions { state: WalletState; connect: () => Promise<void>; disconnect: () => void; switchToArc: () => Promise<void>; submitPlan: (plan: Pretrade) => Promise<{ approval: Hash; deposit: Hash; order: Hash }>; loginWithEmail: (email: string, targetAddress?: string) => void; }

export function useWallet(): WalletActions {
  const [state, setState] = useState<WalletState>({ address: null, chainId: null, status: "DISCONNECTED", error: null });
  const refresh = useCallback(async () => {
    const provider = injected();
    if (provider) {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const chainId = asChainId(await provider.request({ method: "eth_chainId" }));
        const address = accounts[0] ? (accounts[0] as `0x${string}`) : null;
        if (address) {
          setState({ address, chainId, status: chainId === WINNER_CONFIG.chainId ? "CONNECTED" : "WRONG_NETWORK", error: null });
          return;
        }
      } catch {
        /* fallback to session */
      }
    }
    // An email stored in localStorage does not prove wallet ownership. Only
    // eth_accounts from an actual EIP-1193 provider may produce CONNECTED.
    setState({ address: null, chainId: null, status: "DISCONNECTED", error: null });
  }, []);
  useEffect(() => { void refresh(); const provider = injected(); if (!provider?.on) return; const onAccounts = () => void refresh(); const onChain = () => void refresh(); provider.on("accountsChanged", onAccounts); provider.on("chainChanged", onChain); return () => { provider.removeListener?.("accountsChanged", onAccounts); provider.removeListener?.("chainChanged", onChain); }; }, [refresh]);
  const connect = useCallback(async () => { const provider = injected(); if (!provider) { setState((s) => ({ ...s, status: "REJECTED", error: "NO_WALLET" })); return; } setState((s) => ({ ...s, status: "CONNECTING", error: null })); try { await provider.request({ method: "eth_requestAccounts" }); await refresh(); } catch (error) { setState((s) => ({ ...s, status: "REJECTED", error: error instanceof Error ? error.message : "WALLET_REJECTED" })); } }, [refresh]);
  const loginWithEmail = useCallback((_email: string, _targetAddress?: string) => {
    // No OTP/authentication service is configured here. Never synthesize a
    // verified wallet address from an email and mark it CONNECTED.
    setState((current) => ({
      ...current,
      error: "EMAIL_SIGN_IN_NOT_VERIFIED_USE_WALLET",
    }));
  }, []);
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
  const disconnect = useCallback(() => {
    try {
      window.localStorage.removeItem("arcmemeperps.active_email_session");
    } catch {
      /* ignore */
    }
    setState({ address: null, chainId: null, status: "DISCONNECTED", error: null });
  }, []);
  const submitPlan = useCallback(async (plan: Pretrade) => {
    const provider = injected();
    if (!provider || !state.address || state.chainId !== WINNER_CONFIG.chainId)
      throw new Error("REAL_ARC_WALLET_REQUIRED");
    if (WINNER_CONFIG.deploymentStatus !== "DEPLOYED_ZERO_MARKETS")
      throw new Error("ARC_DEPLOYMENT_PENDING");
    if (!WINNER_CONFIG.contracts.USDCMarginVault || !WINNER_CONFIG.contracts.PerpEngine)
      throw new Error("MAINNET_CONTRACTS_UNAVAILABLE");
    if (plan.status !== "AVAILABLE" || plan.qualification?.eligible !== true ||
        !plan.qualification.proofHash || !plan.oracle?.sequence ||
        plan.chainId !== WINNER_CONFIG.chainId ||
        plan.account?.toLowerCase() !== state.address.toLowerCase() ||
        !/^0x[0-9a-fA-F]{64}$/.test(plan.marketId) ||
        !plan.acceptablePriceWad || !plan.sizeUsdWad ||
        !plan.collateralUsdUsdc || !plan.expiry)
      throw new Error("UNVERIFIED_OR_UNBOUND_ORDER_PLAN");
    const collateral = BigInt(plan.collateralUsdUsdc);
    const size = BigInt(plan.sizeUsdWad);
    const price = BigInt(plan.acceptablePriceWad);
    const expiry = BigInt(plan.expiry);
    if (collateral <= 0n || size <= 0n || price <= 0n ||
        expiry <= BigInt(Math.floor(Date.now() / 1000)))
      throw new Error("INVALID_OR_EXPIRED_ORDER");
    if (plan.action !== "OPEN" || !["LONG", "SHORT"].includes(plan.side ?? ""))
      throw new Error("UNSUPPORTED_ORDER_ACTION");

    // Verify that the account actually controls the signing provider; a
    // locally manufactured email address is never accepted as an EVM signer.
    const accounts = await provider.request({ method: "eth_accounts" }) as string[];
    const chain = asChainId(await provider.request({ method: "eth_chainId" }));
    if (!accounts.some((account) => account.toLowerCase() === state.address?.toLowerCase()) ||
        chain !== WINNER_CONFIG.chainId)
      throw new Error("WALLET_SIGNER_OR_CHAIN_MISMATCH");

    const client = createWalletClient({ account: state.address, chain: arc, transport: custom(provider) });
    const reader = createPublicClient({ chain: arc, transport: http(WINNER_CONFIG.rpcUrl) });
    const vault = WINNER_CONFIG.contracts.USDCMarginVault as Address;
    const confirm = async (hash: Hash): Promise<void> => {
      const receipt = await reader.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
      if (receipt.status !== "success")
        throw new Error(`ARC_TRANSACTION_REVERTED_${hash}`);
    };
    const approval = await client.writeContract({
      address: WINNER_CONFIG.usdc, abi: erc20Abi, functionName: "approve",
      args: [vault, collateral],
    });
    await confirm(approval);
    const deposit = await client.writeContract({
      address: vault, abi: vaultAbi, functionName: "deposit", args: [collateral],
    });
    await confirm(deposit);
    const order = await client.writeContract({
      address: WINNER_CONFIG.contracts.PerpEngine as Address, abi: engineAbi,
      functionName: "submitOrder",
      args: [plan.marketId as `0x${string}`, 0, plan.side === "LONG",
        size, collateral, price, expiry],
    });
    await confirm(order);
    // A successful submitOrder receipt proves an order intent was submitted,
    // NOT that the keeper executed it or opened a filled position.
    return { approval, deposit, order };
  }, [state.address, state.chainId]);
  return useMemo(() => ({ state, connect, disconnect, switchToArc, submitPlan, loginWithEmail }), [state, connect, disconnect, switchToArc, submitPlan, loginWithEmail]);
}

export function planHash(plan: Pretrade): string { const action = plan.action === "OPEN" ? 0 : plan.action === "INCREASE" ? 1 : plan.action === "DECREASE" ? 2 : 3; const calldata = encodeFunctionData({ abi: engineAbi, functionName: "submitOrder", args: [plan.marketId as `0x${string}`, action, plan.side === "LONG", BigInt(plan.sizeUsdWad ?? "0"), BigInt(plan.collateralUsdUsdc ?? "0"), BigInt(plan.acceptablePriceWad ?? "0"), BigInt(plan.expiry ?? "0")] }); return keccak256(calldata); }
