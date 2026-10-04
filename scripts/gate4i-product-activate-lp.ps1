$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4IProductLpDpapi {
  [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
  public static byte[] Unprotect(byte[] input) {
    var source = new DataBlob { cbData=input.Length, pbData=Marshal.AllocHGlobal(input.Length) };
    var output = new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length);
    try {
      if (!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear;
    }
    finally {
      if (source.pbData != IntPtr.Zero) Marshal.FreeHGlobal(source.pbData);
      if (output.pbData != IntPtr.Zero) LocalFree(output.pbData);
    }
  }
}
'@

$rpc = "https://rpc.testnet.arc.io"
$cast = "C:\Users\DELL\.foundry\bin\cast.exe"
$protected = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected"
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile, [Gate4IProductLpDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$governance = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\GOVERNANCE_ADMIN"
$timelock = "0xec9eed7f03a945ca9a810ed0db87c6dc6f23901f"
$lp = "0x826892d52172ddef07f2927ba67493465cf54964"
$salt = "0x0000000000000000000000000000000000000000000000000000000000000043"

function Send([string]$to, [string]$signature, [object[]]$arguments) {
    $args = @("send", $to, $signature) + $arguments + @("--rpc-url", $script:rpc, "--keystore", $script:governance, "--password-file", $script:passwordFile, "--json")
    $output = & $script:cast @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "broadcast failed for $signature" }
    return (($output -join "`n") | ConvertFrom-Json).transactionHash
}

function Receipt([string]$hash, [string]$label) {
    $output = & $script:cast receipt $hash --rpc-url $script:rpc --json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "receipt lookup failed" }
    $r = ($output -join "`n") | ConvertFrom-Json
    if ($r.status -ne "0x1") { throw "receipt failed" }
    [pscustomobject]@{ label=$label; tx=$hash; status=$r.status; block=[Convert]::ToUInt64($r.blockNumber.Substring(2),16); gasUsed=[Convert]::ToUInt64($r.gasUsed.Substring(2),16) } | ConvertTo-Json -Compress
}

try {
    $data = (& $cast calldata "setPublicLpActive(bool)" "true").Trim()
    $queue = Send $timelock "queue(address,uint256,bytes,bytes32)" @($lp, "0", $data, $salt)
    Receipt $queue "PRODUCT_TIMELOCK_QUEUE_LP_ACTIVATION"
    $opId = (& $cast keccak ((& $cast abi-encode "f(address,uint256,bytes,bytes32)" $lp "0" $data $salt).Trim())).Trim()
    do {
        Start-Sleep -Seconds 5
        $eta = (& $cast call $timelock "queuedAt(bytes32)(uint64)" $opId --rpc-url $rpc).Trim()
        $latest = & $cast block latest --json --rpc-url $rpc | ConvertFrom-Json
        $now = [Convert]::ToUInt64($latest.timestamp.Substring(2),16)
    } while ([Convert]::ToUInt64($eta.Split(" ")[0]) -gt $now)
    $execute = Send $timelock "execute(address,uint256,bytes,bytes32)" @($lp, "0", $data, $salt)
    Receipt $execute "PRODUCT_TIMELOCK_EXECUTE_LP_ACTIVATION"
}
finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
