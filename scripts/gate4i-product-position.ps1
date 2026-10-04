param(
  [ValidateSet("REDUCE_LONG","CLOSE_LONG","CLOSE_SHORT")][string]$Action,
  [UInt64]$PositionId = 1,
  [UInt64]$SizeReduced = 50000,
  [UInt64]$CollateralReleased = 50000
)
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Gate4IProductPositionDpapi {
  [StructLayout(LayoutKind.Sequential)] public struct DataBlob { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LocalFree(IntPtr memory);
  public static byte[] Unprotect(byte[] input) { var source=new DataBlob{cbData=input.Length,pbData=Marshal.AllocHGlobal(input.Length)}; var output=new DataBlob(); Marshal.Copy(input,0,source.pbData,input.Length); try { if(!CryptUnprotectData(ref source,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref output)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); var clear=new byte[output.cbData]; Marshal.Copy(output.pbData,clear,0,output.cbData); return clear; } finally { if(source.pbData!=IntPtr.Zero) Marshal.FreeHGlobal(source.pbData); if(output.pbData!=IntPtr.Zero) LocalFree(output.pbData); } }
}
'@

$rpc="https://rpc.testnet.arc.io"
$cast="C:\Users\DELL\.foundry\bin\cast.exe"
$engine="0xbd2c3ad91799110adf647493acbaa1f63a40514c"
$protected="C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected"
$passwordFile=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
[IO.File]::WriteAllBytes($passwordFile,[Gate4IProductPositionDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
try {
  if ($Action -eq "REDUCE_LONG") { $key="C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_LONG"; $sig="reducePosition(uint256,uint256,uint256)"; $args=@($PositionId,$SizeReduced,$CollateralReleased) }
  elseif ($Action -eq "CLOSE_LONG") { $key="C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_LONG"; $sig="closePosition(uint256)"; $args=@($PositionId) }
  else { $key="C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\TRADER_SHORT"; $sig="closePosition(uint256)"; $args=@($PositionId) }
  $out=& $cast send $engine $sig @args --rpc-url $rpc --keystore $key --password-file $passwordFile --json 2>&1
  if($LASTEXITCODE -ne 0){throw "Product position action failed: $Action"}
  $hash=(($out -join "`n")|ConvertFrom-Json).transactionHash
  $receiptOut=& $cast receipt $hash --rpc-url $rpc --json 2>&1
  if($LASTEXITCODE -ne 0){throw "Product position receipt lookup failed"}
  $receipt=(($receiptOut -join "`n")|ConvertFrom-Json)
  if($receipt.status -ne "0x1"){throw "Product position receipt reverted"}
  [pscustomobject]@{action=$Action;positionId=$PositionId;sizeReduced=$SizeReduced;collateralReleased=$CollateralReleased;tx=$hash;block=[Convert]::ToUInt64($receipt.blockNumber.Substring(2),16);gasUsed=[Convert]::ToUInt64($receipt.gasUsed.Substring(2),16)}|ConvertTo-Json -Compress
}
finally { if(Test-Path -LiteralPath $passwordFile){Remove-Item -LiteralPath $passwordFile -Force} }
