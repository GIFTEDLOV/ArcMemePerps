param([UInt64]$Sequence=1,[UInt64]$MidPrice=1000000000000000000,[UInt64]$MinPrice=999000000000000000,[UInt64]$MaxPrice=1001000000000000000)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Gate4GReportDpapi { [StructLayout(LayoutKind.Sequential)] public struct DataBlob{public int cbData;public IntPtr pbData;} [DllImport("crypt32.dll",SetLastError=true)] static extern bool CryptUnprotectData(ref DataBlob i,IntPtr d,IntPtr e,IntPtr r,IntPtr p,int f,ref DataBlob o); [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr m); public static byte[] U(byte[] b){var i=new DataBlob{cbData=b.Length,pbData=Marshal.AllocHGlobal(b.Length)};var o=new DataBlob();Marshal.Copy(b,0,i.pbData,b.Length);try{if(!CryptUnprotectData(ref i,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,ref o))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());var c=new byte[o.cbData];Marshal.Copy(o.pbData,c,0,o.cbData);return c;}finally{if(i.pbData!=IntPtr.Zero)Marshal.FreeHGlobal(i.pbData);if(o.pbData!=IntPtr.Zero)LocalFree(o.pbData);}}}
'@
$protected='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystore-password.protected';$pf=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName());[IO.File]::WriteAllBytes($pf,[Gate4GReportDpapi]::U([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$rpc='https://rpc.testnet.arc.io';$market='0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387';$oracle='0x2cab215a4eda6e4a38d94775e6fb91b6d2a5a25b';$version='0xfcf04628118b4208901b1b67765496ba7236d1bc43590f5573d9de0305c38b26';$keeper='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\KEEPER';$r1='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\REPORTER_1';$r2='C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\REPORTER_2';$jsonFile=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName()+'.json')
try {
  $latest=(& 'C:\Users\DELL\.foundry\bin\cast.exe' block latest --json --rpc-url $rpc | ConvertFrom-Json);$now=[Convert]::ToUInt64($latest.timestamp.Substring(2),16);$expiry=$now+100
  $evidence=(& 'C:\Users\DELL\.foundry\bin\cast.exe' keccak "gate4g-live-report-$Sequence-$market").Trim()
  $typed=@"
{
  "domain":{"name":"ArcMemePerps Oracle","version":"1","chainId":5042002,"verifyingContract":"$oracle"},
  "types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"CompositePriceReport":[{"name":"arcChainId","type":"uint256"},{"name":"oracleRouter","type":"address"},{"name":"marketId","type":"bytes32"},{"name":"midPriceWad","type":"uint256"},{"name":"minPriceWad","type":"uint256"},{"name":"maxPriceWad","type":"uint256"},{"name":"confidenceBps","type":"uint256"},{"name":"sourceCount","type":"uint256"},{"name":"independentSourceCount","type":"uint256"},{"name":"observedAt","type":"uint256"},{"name":"validFrom","type":"uint256"},{"name":"expiresAt","type":"uint256"},{"name":"sequence","type":"uint256"},{"name":"evidenceRoot","type":"bytes32"},{"name":"reporterSetVersion","type":"bytes32"}]},
  "primaryType":"CompositePriceReport",
  "message":{"arcChainId":5042002,"oracleRouter":"$oracle","marketId":"$market","midPriceWad":$MidPrice,"minPriceWad":$MinPrice,"maxPriceWad":$MaxPrice,"confidenceBps":9500,"sourceCount":3,"independentSourceCount":3,"observedAt":$now,"validFrom":$now,"expiresAt":$expiry,"sequence":$Sequence,"evidenceRoot":"$evidence","reporterSetVersion":"$version"}
}
"@
  [IO.File]::WriteAllText($jsonFile,$typed,(New-Object System.Text.UTF8Encoding($false)))
  $sig1=(& 'C:\Users\DELL\.foundry\bin\cast.exe' wallet sign --data --from-file $jsonFile --keystore $r1 --password-file $pf).Trim()
  $sig2=(& 'C:\Users\DELL\.foundry\bin\cast.exe' wallet sign --data --from-file $jsonFile --keystore $r2 --password-file $pf).Trim()
  $tuple="($market,5042002,$MidPrice,$MinPrice,$MaxPrice,9500,3,3,$now,$now,$expiry,$Sequence,$evidence,$version)"
  $sigs="[$sig1,$sig2]"
  $result=& 'C:\Users\DELL\.foundry\bin\cast.exe' send $oracle 'setSignedReport((bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64,uint64,uint64,bytes32,bytes32),bytes[])' $tuple $sigs '--rpc-url' $rpc '--keystore' $keeper '--password-file' $pf
  if($LASTEXITCODE-ne 0){throw 'report broadcast failed'}
  $result
} finally {if(Test-Path -LiteralPath $pf){Remove-Item -LiteralPath $pf -Force};if(Test-Path -LiteralPath $jsonFile){Remove-Item -LiteralPath $jsonFile -Force}}
