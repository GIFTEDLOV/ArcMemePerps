$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4GExecDpapi {
  [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
  public static byte[] Unprotect(byte[] input) {
    var source = new DataBlob { cbData=input.Length, pbData=Marshal.AllocHGlobal(input.Length) };
    var output = new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length);
    try { if (!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)) { throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }; var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear; }
    finally { if (source.pbData != IntPtr.Zero) { Marshal.FreeHGlobal(source.pbData); } if (output.pbData != IntPtr.Zero) { LocalFree(output.pbData); } }
  }
}
'@
$protected = 'C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected'
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile, [Gate4GExecDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$rpc='https://rpc.testnet.arc.io'; $timelock='0xde0C8Dbd58D0eB2F742AAab167EAcB2f1fE9C10e'; $usdc='0x3600000000000000000000000000000000000000'; $vault='0xAc2c04FD72bC971Ea5a0cf7B2a0031d60d1f8BDB'; $insurance='0x49264e8002a6d56553305ed3a7b52831571f2aa9'; $key='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\GOVERNANCE_ADMIN'
function Execute([string]$target,[string]$data,[string]$salt) {
  $args=@('send',$timelock,'execute(address,uint256,bytes,bytes32)',$target,'0',$data,$salt,'--rpc-url',$rpc,'--keystore',$key,'--password-file',$passwordFile)
  $result=& 'C:\Users\DELL\.foundry\bin\cast.exe' @args
  if ($LASTEXITCODE -ne 0) { throw "execute failed for $target" }
  $result
}
try {
  $approveVault=(& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'approve(address,uint256)' $vault '5000000').Trim()
  $fundVault=(& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'fundProtocolBacking(uint256)' '5000000').Trim()
  $approveInsurance=(& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'approve(address,uint256)' $insurance '2000000').Trim()
  $fundInsurance=(& 'C:\Users\DELL\.foundry\bin\cast.exe' calldata 'fund(uint256)' '2000000').Trim()
  Execute $usdc $approveVault '0x0000000000000000000000000000000000000000000000000000000000000001'
  Execute $vault $fundVault '0x0000000000000000000000000000000000000000000000000000000000000002'
  Execute $usdc $approveInsurance '0x0000000000000000000000000000000000000000000000000000000000000003'
  Execute $insurance $fundInsurance '0x0000000000000000000000000000000000000000000000000000000000000004'
} finally { if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force } }
