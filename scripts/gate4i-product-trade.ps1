param([ValidateSet("LONG","SHORT")][string]$Side = "LONG", [UInt64]$Size = 100000, [UInt64]$Collateral = 100000, [UInt64]$OracleSequence = 1, [switch]$SubmitOnly)
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4IProductTradeDpapi {
  [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
  public static byte[] Unprotect(byte[] input) {
    var source = new DataBlob { cbData=input.Length, pbData=Marshal.AllocHGlobal(input.Length) };
    var output = new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length);
    try { if (!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear; }
    finally { if (source.pbData != IntPtr.Zero) Marshal.FreeHGlobal(source.pbData); if (output.pbData != IntPtr.Zero) LocalFree(output.pbData); }
  }
}
'@

$rpc = "https://rpc.testnet.arc.io"
$cast = "C:\Users\DELL\.foundry\bin\cast.exe"
$protected = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected"
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile, [Gate4IProductTradeDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$market = "0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387"
$engine = "0xbd2c3ad91799110adf647493acbaa1f63a40514c"
$traderAddress = if ($Side -eq "LONG") { "0xC36FD43DEaAdefB349aCc61B0eb664eA4a18861C" } else { "0x9202ea7BD1950510149F914A4fccF8a915b1C5fE" }
$traderKey = if ($Side -eq "LONG") { "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_LONG" } else { "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_SHORT" }
$keeperKey = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\KEEPER"

function Send([string]$keystore, [string]$to, [string]$signature, [object[]]$arguments, [string]$label) {
    $args = @("send", $to, $signature) + $arguments + @("--rpc-url", $script:rpc, "--keystore", $keystore, "--password-file", $script:passwordFile, "--json")
    $output = & $script:cast @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "broadcast failed for $label" }
    $hash = (($output -join "`n") | ConvertFrom-Json).transactionHash
    $receiptOutput = & $script:cast receipt $hash --rpc-url $script:rpc --json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "receipt lookup failed for $label" }
    $receipt = ($receiptOutput -join "`n") | ConvertFrom-Json
    if ($receipt.status -ne "0x1") { throw "receipt failed for $label" }
    [pscustomobject]@{ label=$label; tx=$hash; block=[Convert]::ToUInt64($receipt.blockNumber.Substring(2),16); gasUsed=[Convert]::ToUInt64($receipt.gasUsed.Substring(2),16) } | ConvertTo-Json -Compress
    return $hash
}

try {
    $latest = & $cast block latest --json --rpc-url $rpc | ConvertFrom-Json
    $expiry = [Convert]::ToUInt64($latest.timestamp.Substring(2),16) + 60
    $isLong = if ($Side -eq "LONG") { "true" } else { "false" }
    $nonce = ((& $cast call $engine "nextOrderNonce(address)(uint256)" $traderAddress --rpc-url $rpc).Trim().Split(" ")[0])
    $encoded = (& $cast abi-encode "f(address,bytes32,uint8,bool,uint256,uint256,uint256,uint64,uint256)" $traderAddress $market "0" $isLong $Size $Collateral "2000000000000000000" $expiry $nonce).Trim()
    $orderId = (& $cast keccak $encoded).Trim()
    Send $traderKey $engine "submitOrder(bytes32,uint8,bool,uint256,uint256,uint256,uint64)" @($market, "0", $isLong, $Size, $Collateral, "2000000000000000000", $expiry) "${Side}_ORDER_SUBMIT"
    if (-not $SubmitOnly) { Send $keeperKey $engine "executeOrder(bytes32,uint64)" @($orderId, $OracleSequence) "${Side}_ORDER_EXECUTE" }
    [pscustomobject]@{ side=$Side; orderId=$orderId; nonce=$nonce; oracleSequence=$OracleSequence; size=$Size; collateral=$Collateral; expiry=$expiry } | ConvertTo-Json -Compress
}
finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
