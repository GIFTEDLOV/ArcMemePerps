param([UInt64]$Sequence = 1, [UInt64]$MidPrice = 1000000000000000000, [UInt64]$MinPrice = 999000000000000000, [UInt64]$MaxPrice = 1001000000000000000)
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Gate4IProductReportDpapi {
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
[IO.File]::WriteAllBytes($passwordFile, [Gate4IProductReportDpapi]::Unprotect([Convert]::FromBase64String(([IO.File]::ReadAllText($protected)).Trim())))
$market = "0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387"
$oracle = "0xfdc85c3a13186e9be0ad63c34b5162de25bd39a5"
$version = "0xfcf04628118b4208901b1b67765496ba7236d1bc43590f5573d9de0305c38b26"
$keeper = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\KEEPER"
$reporter1 = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\REPORTER_1"
$reporter2 = "C:\Users\DELL\.arcmemeperps\gate4g-recovered-keystores\REPORTER_2"
$jsonFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + ".json")

try {
    $latest = & $cast block latest --json --rpc-url $rpc | ConvertFrom-Json
    $now = [Convert]::ToUInt64($latest.timestamp.Substring(2),16)
    $expiry = $now + 100
    $evidence = (& $cast keccak "gate4i-product-report-$Sequence-$market").Trim()
    $typed = @"
{
  "domain":{"name":"ArcMemePerps Oracle","version":"1","chainId":5042002,"verifyingContract":"$oracle"},
  "types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"CompositePriceReport":[{"name":"arcChainId","type":"uint256"},{"name":"oracleRouter","type":"address"},{"name":"marketId","type":"bytes32"},{"name":"midPriceWad","type":"uint256"},{"name":"minPriceWad","type":"uint256"},{"name":"maxPriceWad","type":"uint256"},{"name":"confidenceBps","type":"uint256"},{"name":"sourceCount","type":"uint256"},{"name":"independentSourceCount","type":"uint256"},{"name":"observedAt","type":"uint256"},{"name":"validFrom","type":"uint256"},{"name":"expiresAt","type":"uint256"},{"name":"sequence","type":"uint256"},{"name":"evidenceRoot","type":"bytes32"},{"name":"reporterSetVersion","type":"bytes32"}]},
  "primaryType":"CompositePriceReport",
  "message":{"arcChainId":5042002,"oracleRouter":"$oracle","marketId":"$market","midPriceWad":$MidPrice,"minPriceWad":$MinPrice,"maxPriceWad":$MaxPrice,"confidenceBps":9500,"sourceCount":3,"independentSourceCount":3,"observedAt":$now,"validFrom":$now,"expiresAt":$expiry,"sequence":$Sequence,"evidenceRoot":"$evidence","reporterSetVersion":"$version"}
}
"@
    [IO.File]::WriteAllText($jsonFile, $typed, (New-Object System.Text.UTF8Encoding($false)))
    $sig1 = (& $cast wallet sign --data --from-file $jsonFile --keystore $reporter1 --password-file $passwordFile).Trim()
    $sig2 = (& $cast wallet sign --data --from-file $jsonFile --keystore $reporter2 --password-file $passwordFile).Trim()
    $tuple = "($market,5042002,$MidPrice,$MinPrice,$MaxPrice,9500,3,3,$now,$now,$expiry,$Sequence,$evidence,$version)"
    $sigs = "[$sig1,$sig2]"
    & $cast send $oracle "setSignedReport((bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64,uint64,uint64,bytes32,bytes32),bytes[])" $tuple $sigs --rpc-url $rpc --keystore $keeper --password-file $passwordFile
    if ($LASTEXITCODE -ne 0) { throw "Product oracle report failed" }
}
finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
    if (Test-Path -LiteralPath $jsonFile) { Remove-Item -LiteralPath $jsonFile -Force }
}
