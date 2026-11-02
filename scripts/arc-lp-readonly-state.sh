#!/usr/bin/env bash
# Read-only inspection of the addresses recorded in evidence/mainnet-suite-deployment.json.
# No keys, approvals, calls that mutate state, or funds are used.
set -euo pipefail

RPC_URL="${ARC_RPC_URL:-https://rpc.mainnet.arc.io}"
PUBLIC_LP="0x9ff8358dc5ee866e0b9707d0139cf47b399f5257"
MARGIN="0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf"
USDC="0x3600000000000000000000000000000000000000"

read_call() {
  local result
  result="$(timeout 40s cast call "$1" "$2" ${3:+"$3"} --block "$OBSERVED_BLOCK" --rpc-url "$RPC_URL")"
  if [[ -z "$result" ]]; then
    # An empty return payload can mean this getter is absent in deployed bytecode.
    echo "UNAVAILABLE_NO_RETURN_DATA"
  else
    echo "$result"
  fi
}

CHAIN_ID="$(timeout 40s cast chain-id --rpc-url "$RPC_URL")"
echo "network_chain_id=$CHAIN_ID"
OBSERVED_BLOCK="$(timeout 40s cast block-number --rpc-url "$RPC_URL")"
echo "observed_block=$OBSERVED_BLOCK"
if [[ "$CHAIN_ID" != "5042" ]]; then
  echo "ERROR: RPC does not report Arc mainnet chain 5042" >&2
  exit 1
fi

for contract in "$PUBLIC_LP" "$MARGIN"; do
  code="$(timeout 40s cast code "$contract" --block "$OBSERVED_BLOCK" --rpc-url "$RPC_URL")"
  if [[ "$code" == "0x" || -z "$code" ]]; then
    echo "ERROR: no runtime bytecode at $contract" >&2
    exit 1
  fi
  echo "contract_$contract=deployed"
done

echo "--- PublicLPVault ledger and permissions ---"
for signature in \
  'owner()(address)' \
  'publicLpActive()(bool)' \
  'totalShares()(uint256)' \
  'managedAssets()(uint256)' \
  'allocatedBacking()(uint256)' \
  'marketRiskBudget()(uint256)' \
  'pendingTraderLiability()(uint256)' \
  'insuranceReserve()(uint256)' \
  'cumulativeBadDebt()(uint256)' \
  'withdrawalCooldown()(uint256)' \
  'riskController()(address)' \
  'marginVault()(address)' \
  'governanceExecutor()(address)' \
  'bootstrapFinalized()(bool)' \
  'navAssets()(uint256)'; do
  echo "$signature=$(read_call "$PUBLIC_LP" "$signature")"
done

echo "--- Margin vault custody and exposure ---"
for signature in \
  'lpBacking()(uint256)' \
  'rawCash()(uint256)' \
  'totalFreeCollateral()(uint256)' \
  'totalLockedCollateral()(uint256)' \
  'pendingPositivePnl()(uint256)' \
  'protocolBadDebt()(uint256)' \
  'withdrawableLiquidity()(uint256)' \
  'lpRecoverable()(uint256)' \
  'lpVault()(address)'; do
  echo "$signature=$(read_call "$MARGIN" "$signature")"
done

echo "--- USDC native ERC20 balances in base units ---"
echo "USDC_decimals=$(read_call "$USDC" 'decimals()(uint8)')"
echo "vaultUSDC=$(read_call "$USDC" 'balanceOf(address)(uint256)' "$PUBLIC_LP")"
echo "marginUSDC=$(read_call "$USDC" 'balanceOf(address)(uint256)' "$MARGIN")"
echo "STATUS: read-only calls complete. Do not infer withdrawal safety without reviewing roles, market exposure and state freshness."
