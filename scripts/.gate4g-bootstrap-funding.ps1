$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4GDpapiFunding {
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

$passwordProtected = 'C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected'
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile, [Gate4GDpapiFunding]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($passwordProtected)).Trim())))
$rpc = 'https://rpc.testnet.arc.io'
$usdc = '0x3600000000000000000000000000000000000000'
$deployer = '0x456A3ab835Bea90b42FF207B6c42BCE0BFF3e833'
$governance = '0x867E0B85a1dd5d342571A7Dbdb98A71b24e6D77F'
$timelock = '0xde0C8Dbd58D0eB2F742AAab167EAcB2f1fE9C10e'
$vault = '0xAc2c04FD72bC971Ea5a0cf7B2a0031d60d1f8BDB'
$insurance = '0x49264e8002a6d56553305ed3a7b52831571f2aa9'
$deployerKey = 'C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\V2_DEPLOYER'
$governanceKey = 'C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\GOVERNANCE_ADMIN'

function Send([string]$keystore, [string]$to, [string]$signature, [object[]]$arguments) {
  $args = @('send', $to, $signature) + $arguments + @('--rpc-url', $script:rpc, '--keystore', $keystore, '--password-file', $script:passwordFile)
  $result = & 'C:\Users\DELL\.foundry\bin\cast.exe' @args
  if ($LASTEXITCODE -ne 0) { throw "broadcast failed for $signature" }
  Write-Output "${signature} RESULT"
  $result
}

try {
  $approveVault = (& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'approve(address,uint256)' $vault '5000000').Trim()
  $fundVault = (& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'fundProtocolBacking(uint256)' '5000000').Trim()
  $approveInsurance = (& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'approve(address,uint256)' $insurance '2000000').Trim()
  $fundInsurance = (& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'fund(uint256)' '2000000').Trim()

  Send $governanceKey $timelock 'queue(address,uint256,bytes,bytes32)' @($usdc, '0', $approveVault, '0x0000000000000000000000000000000000000000000000000000000000000001')
  Send $governanceKey $timelock 'queue(address,uint256,bytes,bytes32)' @($vault, '0', $fundVault, '0x0000000000000000000000000000000000000000000000000000000000000002')
  Send $governanceKey $timelock 'queue(address,uint256,bytes,bytes32)' @($usdc, '0', $approveInsurance, '0x0000000000000000000000000000000000000000000000000000000000000003')
  Send $governanceKey $timelock 'queue(address,uint256,bytes,bytes32)' @($insurance, '0', $fundInsurance, '0x0000000000000000000000000000000000000000000000000000000000000004')
} finally {
  if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
