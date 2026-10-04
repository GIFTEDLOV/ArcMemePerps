$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4IProductUsersDpapi {
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
[IO.File]::WriteAllBytes($passwordFile, [Gate4IProductUsersDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$usdc = "0x3600000000000000000000000000000000000000"
$vault = "0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab"
$lp = "0x826892d52172ddef07f2927ba67493465cf54964"
$lp1 = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\LP_1"
$lp2 = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\LP_2"
$long = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_LONG"
$short = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_SHORT"

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
}

try {
    Send $lp1 $usdc "approve(address,uint256)" @($lp, "800000") "LP1_APPROVE"
    Send $lp1 $lp "deposit(uint256)" @("800000") "LP1_DEPOSIT"
    Send $lp2 $usdc "approve(address,uint256)" @($lp, "1000000") "LP2_APPROVE"
    Send $lp2 $lp "deposit(uint256)" @("1000000") "LP2_DEPOSIT"
    Send $long $usdc "approve(address,uint256)" @($vault, "300000") "TRADER_LONG_APPROVE"
    Send $long $vault "deposit(uint256)" @("300000") "TRADER_LONG_DEPOSIT"
    Send $short $usdc "approve(address,uint256)" @($vault, "300000") "TRADER_SHORT_APPROVE"
    Send $short $vault "deposit(uint256)" @("300000") "TRADER_SHORT_DEPOSIT"
}
finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
