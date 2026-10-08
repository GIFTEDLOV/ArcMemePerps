$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4GInsDpapi {
 [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
 [DllImport("crypt32.dll",SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input,IntPtr description,IntPtr entropy,IntPtr reserved,IntPtr prompt,int flags,ref DataBlob output);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
 public static byte[] Unprotect(byte[] input) { var source=new DataBlob{cbData=input.Length,pbData=Marshal.AllocHGlobal(input.Length)}; var output=new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length); try { if(!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)){throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());} var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear;} finally {if(source.pbData!=IntPtr.Zero){Marshal.FreeHGlobal(source.pbData);} if(output.pbData!=IntPtr.Zero){LocalFree(output.pbData);}} }
}
'@
$protected='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected'; $passwordFile=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName()); [IO.File]::WriteAllBytes($passwordFile,[Gate4GInsDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$rpc='https://rpc.testnet.arc.io'; $usdc='0x3600000000000000000000000000000000000000'; $deployerKey='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\V2_DEPLOYER'; $governanceKey='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\GOVERNANCE_ADMIN'; $insuranceKey='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\INSURANCE_MANAGER'; $timelock='0xde0C8Dbd58D0eB2F742AAab167EAcB2f1fE9C10e'; $insurance='0x49264e8002a6d56553305ed3a7b52831571f2aa9'; $insuranceManager='0x3a0BDe26Ba9b86462f05Ff340F755a182b061403'; $staleOp='0xfd3b9bf9b346013addf2094b4574b75b2474730b7e126fa1abab7496ee231e60'
function Send([string]$key,[string]$to,[string]$sig,[object[]]$callArgs){$argv=@('send',$to,$sig)+$callArgs+@('--rpc-url',$rpc,'--keystore',$key,'--password-file',$passwordFile);$out=& 'C:\Users\DELL\.foundry\bin\cast.exe' @argv;if($LASTEXITCODE -ne 0){throw "send failed $sig"};$out}
try { Send $governanceKey $timelock 'cancel(bytes32)' @($staleOp); Send $deployerKey $usdc 'transfer(address,uint256)' @($insuranceManager,'2000000'); Send $insuranceKey $usdc 'approve(address,uint256)' @($insurance,'2000000'); Send $insuranceKey $insurance 'fund(uint256)' @('2000000') } finally { if(Test-Path -LiteralPath $passwordFile){Remove-Item -LiteralPath $passwordFile -Force} }
