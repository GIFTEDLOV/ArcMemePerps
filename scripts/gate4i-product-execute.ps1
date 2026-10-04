param([Parameter(Mandatory=$true)][string]$OrderId, [UInt64]$OracleSequence = 2)
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Gate4IProductExecuteDpapi {
  [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
  public static byte[] Unprotect(byte[] input) { var source=new DataBlob{cbData=input.Length,pbData=Marshal.AllocHGlobal(input.Length)}; var output=new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length); try { if(!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear; } finally { if(source.pbData!=IntPtr.Zero) Marshal.FreeHGlobal(source.pbData); if(output.pbData!=IntPtr.Zero) LocalFree(output.pbData); } }
}
'@
$rpc="https://rpc.testnet.arc.io";$cast="C:\Users\DELL\.foundry\bin\cast.exe";$protected="C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected";$pf=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName());[IO.File]::WriteAllBytes($pf,[Gate4IProductExecuteDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
try { & $cast send "0xbd2c3ad91799110adf647493acbaa1f63a40514c" "executeOrder(bytes32,uint64)" $OrderId $OracleSequence --rpc-url $rpc --keystore "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\KEEPER" --password-file $pf; if($LASTEXITCODE -ne 0){throw "Product order execution failed"} } finally { if(Test-Path -LiteralPath $pf){Remove-Item -LiteralPath $pf -Force} }
