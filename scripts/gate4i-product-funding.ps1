$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4IProductFundingDpapi {
  [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
  public static byte[] Unprotect(byte[] input) {
    var source = new DataBlob { cbData=input.Length, pbData=Marshal.AllocHGlobal(input.Length) };
    var output = new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length);
    try {
      if (!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
      var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear;
    }
    finally {
      if (source.pbData != IntPtr.Zero) { Marshal.FreeHGlobal(source.pbData); }
      if (output.pbData != IntPtr.Zero) { LocalFree(output.pbData); }
    }
  }
}
'@

$rpc = "https://rpc.testnet.arc.io"
$cast = "C:\Users\DELL\.foundry\bin\cast.exe"
$passwordProtected = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected"
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile, [Gate4IProductFundingDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($passwordProtected)).Trim())))

$usdc = "0x3600000000000000000000000000000000000000"
$deployer = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\V2_DEPLOYER"
$governance = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\GOVERNANCE_ADMIN"
$insuranceManager = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\INSURANCE_MANAGER"
$timelockAddress = "0xec9eed7f03a945ca9a810ed0db87c6dc6f23901f"
$vaultAddress = "0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab"
$insuranceAddress = "0x131ce3346eb5e15a3ae3c1cba2cd93d54dc6877b"
$insuranceManagerAddress = "0x3a0BDe26Ba9b86462f05Ff340F755a182b061403"
$backing = "5000000"
$insuranceCapital = "2000000"
$saltApprove = "0x0000000000000000000000000000000000000000000000000000000000000041"
$saltFund = "0x0000000000000000000000000000000000000000000000000000000000000042"

function SendJson([string]$keystore, [string]$to, [string]$signature, [object[]]$arguments) {
    $args = @("send", $to, $signature) + $arguments + @("--rpc-url", $script:rpc, "--keystore", $keystore, "--password-file", $script:passwordFile, "--json")
    $output = & $script:cast @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "broadcast failed for $signature" }
    $json = ($output -join "`n") | ConvertFrom-Json
    return $json.transactionHash
}

function SendNative([string]$keystore, [string]$to, [string]$wei) {
    $args = @("send", $to, "--value", $wei, "--rpc-url", $script:rpc, "--keystore", $keystore, "--password-file", $script:passwordFile, "--json")
    $output = & $script:cast @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "native gas transfer failed for $to" }
    $json = ($output -join "`n") | ConvertFrom-Json
    return $json.transactionHash
}

function Receipt([string]$hash) {
    $output = & $script:cast receipt $hash --rpc-url $script:rpc --json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "receipt lookup failed for $hash" }
    $json = ($output -join "`n") | ConvertFrom-Json
    if ($json.status -ne "0x1") { throw "receipt failed for $hash" }
    return $json
}

function PrintReceipt([string]$label, [string]$hash) {
    $receipt = Receipt $hash
    [pscustomobject]@{
        label = $label
        tx = $hash
        status = $receipt.status
        block = [Convert]::ToUInt64($receipt.blockNumber.Substring(2), 16)
        gasUsed = [Convert]::ToUInt64($receipt.gasUsed.Substring(2), 16)
    } | ConvertTo-Json -Compress
}

try {
    $gasTopUp = SendNative $deployer $insuranceManagerAddress "5000000000000000"
    PrintReceipt "PRODUCT_INSURANCE_MANAGER_GAS_TOPUP" $gasTopUp
    $transferBacking = SendJson $deployer $usdc "transfer(address,uint256)" @($timelockAddress, $backing)
    PrintReceipt "PRODUCT_BACKING_TRANSFER_TO_TIMELOCK" $transferBacking
    $transferInsurance = SendJson $deployer $usdc "transfer(address,uint256)" @($insuranceManagerAddress, $insuranceCapital)
    PrintReceipt "PRODUCT_INSURANCE_TRANSFER_TO_MANAGER" $transferInsurance

    $approveInsurance = SendJson $insuranceManager $usdc "approve(address,uint256)" @($insuranceAddress, $insuranceCapital)
    PrintReceipt "PRODUCT_INSURANCE_APPROVAL" $approveInsurance
    $fundInsurance = SendJson $insuranceManager $insuranceAddress "fund(uint256)" @($insuranceCapital)
    PrintReceipt "PRODUCT_INSURANCE_FUND" $fundInsurance

    $approveData = (& $script:cast calldata "approve(address,uint256)" $vaultAddress $backing).Trim()
    $fundData = (& $script:cast calldata "fundProtocolBacking(uint256)" $backing).Trim()
    $queueApprove = SendJson $governance $timelockAddress "queue(address,uint256,bytes,bytes32)" @($usdc, "0", $approveData, $saltApprove)
    PrintReceipt "PRODUCT_TIMELOCK_QUEUE_USDC_APPROVAL" $queueApprove
    $queueFund = SendJson $governance $timelockAddress "queue(address,uint256,bytes,bytes32)" @($vaultAddress, "0", $fundData, $saltFund)
    PrintReceipt "PRODUCT_TIMELOCK_QUEUE_VAULT_FUND" $queueFund

    do {
        Start-Sleep -Seconds 5
        $etaApprove = (& $script:cast call $timelockAddress "queuedAt(bytes32)(uint64)" ((& $script:cast keccak ((& $script:cast abi-encode "f(address,uint256,bytes,bytes32)" $usdc "0" $approveData $saltApprove).Trim())).Trim()) --rpc-url $script:rpc).Trim()
        $etaFund = (& $script:cast call $timelockAddress "queuedAt(bytes32)(uint64)" ((& $script:cast keccak ((& $script:cast abi-encode "f(address,uint256,bytes,bytes32)" $vaultAddress "0" $fundData $saltFund).Trim())).Trim()) --rpc-url $script:rpc).Trim()
        $latest = & $script:cast block latest --json --rpc-url $script:rpc | ConvertFrom-Json
        $timestamp = [Convert]::ToUInt64($latest.timestamp.Substring(2), 16)
        $readyApprove = [Convert]::ToUInt64($etaApprove.Split(" ")[0]) -le $timestamp
        $readyFund = [Convert]::ToUInt64($etaFund.Split(" ")[0]) -le $timestamp
    } while (-not ($readyApprove -and $readyFund))

    $executeApprove = SendJson $governance $timelockAddress "execute(address,uint256,bytes,bytes32)" @($usdc, "0", $approveData, $saltApprove)
    PrintReceipt "PRODUCT_TIMELOCK_EXECUTE_USDC_APPROVAL" $executeApprove
    $executeFund = SendJson $governance $timelockAddress "execute(address,uint256,bytes,bytes32)" @($vaultAddress, "0", $fundData, $saltFund)
    PrintReceipt "PRODUCT_TIMELOCK_EXECUTE_VAULT_FUND" $executeFund
}
finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
