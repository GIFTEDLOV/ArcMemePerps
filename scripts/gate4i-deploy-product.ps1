param(
    [switch]$Broadcast
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4IProductDpapi {
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

$passwordProtected = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected"
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile, [Gate4IProductDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($passwordProtected)).Trim())))

$env:ARC_TESTNET_USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
$env:GOVERNANCE_ADMIN_ADDRESS = "0x867E0B85a1dd5d342571A7Dbdb98A71b24e6D77F"
$env:RISK_ADMIN_ADDRESS = "0x327202b6638ACB7dD7b3B2D9a7b14B32FC2B7448"
$env:EMERGENCY_ADMIN_ADDRESS = "0xA6038073Fcfc2db7A37C54e106E182928ABFF3a7"
$env:ORACLE_ADMIN_ADDRESS = "0x9a3443C679DcFeEF1Fbf46Ab8bfE4ABA7bd20e5E"
$env:QUALIFICATION_WRITER_ADDRESS = "0x4445656Fe52116CA653d4F86a16705964A99d4A6"
$env:KEEPER_ADDRESS = "0xDAFBAB12B5456b633F0DdC9D8470B5361eA76e44"
$env:INSURANCE_MANAGER_ADDRESS = "0x3a0BDe26Ba9b86462f05Ff340F755a182b061403"
$env:REPORTER_1_ADDRESS = "0x5b603D76A46A5a974D21c4112929DcD93aF4eDCD"
$env:REPORTER_2_ADDRESS = "0x245996aDE245356CC5e1dDbE34AC53101f4467a1"
$env:REPORTER_3_ADDRESS = "0x61aA79c0409f5De54Dc9ffd09E2b9bDD576ddfdb"
$env:SKIP_INITIAL_FUNDING = "1"

$forgeArgs = @(
    "script",
    "contracts/script/DeployGate4GV2.s.sol:DeployGate4GV2",
    "--rpc-url", "https://rpc.testnet.arc.io",
    "--keystore", "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\V2_DEPLOYER",
    "--password-file", $passwordFile,
    "--non-interactive"
)
if ($Broadcast) {
    $forgeArgs += @("--broadcast", "--slow")
}

try {
    & "C:\Users\DELL\.foundry\bin\forge.exe" @forgeArgs
    if ($LASTEXITCODE -ne 0) { throw "Product deployment command failed with exit code $LASTEXITCODE" }
}
finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
