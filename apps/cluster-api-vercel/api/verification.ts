/**
 * CLUSTER Arc mainnet on-chain market verification.
 * Exact contract addresses from evidence/mainnet/contracts.json.
 *
 * This is a read-only, fail-closed proof endpoint, NOT trade authorization.
 * Historical indexing, off-chain source provenance, exact deployed-bytecode parity,
 * signer/role graph and LP-to-margin accounting are independently required gates.
 */
const RPC = "https://rpc.mainnet.arc.io";
const A = {
  market: "0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b",
  qualification: "0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7",
  risk: "0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85",
  oracle: "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff",
  engine: "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1",
  margin: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf",
  insurance: "0x8b0550babc3b802d89c17dfbee85828e14e6a22b",
  lp: "0x9ff8358dc5ee866e0b9707d0139cf47b399f5257"
} as const;
// Selectors are KECCAK-256(signature)[0:4], NOT SHA3-256.
const S = {
  bootstrap:"26f2c5ae", exists:"d8d03989", state:"ead29b0b",
  approved:"48aefc32",qualification:"af57eb07",config:"6dd5b69d",
  appliedProof:"a337950b",appliedAt:"3fe28518",
  usable:"2333654c",report:"171c4f11",oi:"2768bcf1",
  insolvency:"e09b42ff",custody:"e177f4de",expected:"a1baae40",
  withdrawable:"8fff9ce7",lpActive:"8795ce2a",
  badDebt:"a9c3cbb2",engineMarket:"ecb96fe6",
  engineRisk:"7c90a6ca",engineOracle:"55a29e91",
  engineMargin:"c2b12cb6",engineInsurance:"b7902303",
  marginEngine:"c9d4623f",insuranceCapital:"199cb7d8"
} as const;
type Check = { pass:boolean; evidence:string|null; reason:string|null };
const fail=(reason:string,evidence:string|null=null):Check=>({pass:false,evidence,reason});
const pass=(evidence:string|null=null):Check=>({pass:true,evidence,reason:null});
function words(hex:string):bigint[]{
  if(!/^0x[0-9a-fA-F]*$/.test(hex) || (hex.length-2)%64!==0 || hex==="0x")throw Error("INVALID_ABI_RETURN");
  const chunks=hex.slice(2).match(/.{64}/g)??[];
  return chunks.map(v=>BigInt("0x"+v));
}
function address(hexWord:bigint):string{return "0x"+hexWord.toString(16).padStart(40,"0").slice(-40);}
function short(v:bigint){return v.toString(10);}
const nonzero=(v:bigint)=>v!==0n;
async function rpc(method:string,params:unknown[]):Promise<string>{
  const response=await fetch(RPC,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw Error("RPC_HTTP_"+response.status);
  const value=await response.json() as {result?:unknown;error?:{message?:string}};
  if(value.error)throw Error("RPC_CALL_REVERTED");
  if(typeof value.result!=="string")throw Error("RPC_INVALID_RESULT");
  return value.result;
}
async function call(to:string,selector:string,marketId:string|null,blockTag:string):Promise<bigint[]>{
  const data="0x"+selector+(marketId===null?"":marketId.slice(2));
  return words(await rpc("eth_call",[{to,data},blockTag]));
}
export async function verifyArcMarket(marketId:string):Promise<Response>{
 const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
   "access-control-allow-origin":"*","x-content-type-options":"nosniff"};
 const result=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(!/^0x[0-9a-fA-F]{64}$/.test(marketId))
   return result({error:"MARKET_ID_MUST_BE_CANONICAL_BYTES32",tradingEnabled:false},400);
 const checks:Record<string,Check>={};
 try{
  const chain=BigInt(await rpc("eth_chainId",[]));
  if(chain!==5042n)return result({error:"WRONG_NETWORK",tradingEnabled:false},503);
  const blockTag=await rpc("eth_blockNumber",[]);
  const tasks:Record<string,()=>Promise<bigint[]>>={
    engineBootstrap:()=>call(A.engine,S.bootstrap,null,blockTag),
    oracleBootstrap:()=>call(A.oracle,S.bootstrap,null,blockTag),
    qualificationBootstrap:()=>call(A.qualification,S.bootstrap,null,blockTag),
    riskBootstrap:()=>call(A.risk,S.bootstrap,null,blockTag),
    marketBootstrap:()=>call(A.market,S.bootstrap,null,blockTag),
    marginBootstrap:()=>call(A.margin,S.bootstrap,null,blockTag),
    insuranceBootstrap:()=>call(A.insurance,S.bootstrap,null,blockTag),
    lpBootstrap:()=>call(A.lp,S.bootstrap,null,blockTag),
    lpActive:()=>call(A.lp,S.lpActive,null,blockTag),
    engineSolvency:()=>call(A.engine,S.insolvency,null,blockTag),
    marketExists:()=>call(A.market,S.exists,marketId,blockTag),
    qualificationApproved:()=>call(A.qualification,S.approved,marketId,blockTag),
    qualification:()=>call(A.qualification,S.qualification,marketId,blockTag),
    marketState:()=>call(A.market,S.state,marketId,blockTag),
    riskConfig:()=>call(A.risk,S.config,marketId,blockTag),
    appliedProof:()=>call(A.risk,S.appliedProof,marketId,blockTag),
    appliedAt:()=>call(A.risk,S.appliedAt,marketId,blockTag),
    oracleUsable:()=>call(A.oracle,S.usable,marketId,blockTag),
    oracleReport:()=>call(A.oracle,S.report,marketId,blockTag),
    openInterest:()=>call(A.engine,S.oi,marketId,blockTag),
    engineMarket:()=>call(A.engine,S.engineMarket,null,blockTag),
    engineRisk:()=>call(A.engine,S.engineRisk,null,blockTag),
    engineOracle:()=>call(A.engine,S.engineOracle,null,blockTag),
    engineMargin:()=>call(A.engine,S.engineMargin,null,blockTag),
    engineInsurance:()=>call(A.engine,S.engineInsurance,null,blockTag),
    marginEngine:()=>call(A.margin,S.marginEngine,null,blockTag),
    marginCustody:()=>call(A.margin,S.custody,null,blockTag),
    marginExpected:()=>call(A.margin,S.expected,null,blockTag),
    marginWithdrawable:()=>call(A.margin,S.withdrawable,null,blockTag),
    marginBadDebt:()=>call(A.margin,S.badDebt,null,blockTag),
    insuranceCapital:()=>call(A.insurance,S.insuranceCapital,null,blockTag)
  };
  const entries:Array<readonly [string,bigint[]|null]>=[];
  const pairs=Object.entries(tasks);
  for(let i=0;i<pairs.length;i+=4){
    entries.push(...await Promise.all(pairs.slice(i,i+4).map(async ([name,run])=>{
      try{return [name,await run()] as const;}catch{return [name,null] as const;}
    })));
  }
  const values=Object.fromEntries(entries) as Record<string,bigint[]|null>;
  function bool(name:string,key:string,expected:boolean){
    const x=values[key];
    checks[name]=!x?.length?fail("READ_FAILED_OR_REVERTED"):Boolean(x[0])===expected?pass(String(expected)):fail("ONCHAIN_STATE_MISMATCH",String(Boolean(x[0])));
  }
  function addr(name:string,key:string,expected:string){
    const x=values[key],actual=x?.length?address(x[0]!):null;
    checks[name]=actual===null?fail("READ_FAILED_OR_REVERTED"):actual.toLowerCase()===expected.toLowerCase()?pass(actual):fail("WRONG_CONTRACT_WIRING",actual);
  }
  bool("engineBootstrapFinalized","engineBootstrap",true);
  for(const item of ["oracle","qualification","risk","market","margin","insurance"]){
    bool(item+"BootstrapFinalized",item+"Bootstrap",true);
  }
  bool("lpBootstrapFinalized","lpBootstrap",true);
  // LP must remain inactive until independent accounting reconciliation is evidenced.
  bool("marketRegistered","marketExists",true);
  const m=values.marketState;
  checks.marketLive=m?.length?(m[0]===3n?pass("LIVE"):fail("MARKET_NOT_LIVE",short(m[0]!))):fail("READ_FAILED_OR_REVERTED");
  bool("qualificationCurrentlyApproved","qualificationApproved",true);
  const q=values.qualification;
  if(q&&q.length>=8){
    const good=nonzero(q[0]!)&&nonzero(q[1]!)&&q[7]===1n&&q[2]!>0n&&(q[3]===0n||q[3]!>q[2]!);
    checks.qualificationProof=good?pass("on-chain proof + rule hash, expiry, approval"):fail("PROOF_MISSING_REVOKED_OR_EXPIRED");
  }else checks.qualificationProof=fail("READ_FAILED_OR_REVERTED");
  const cfg=values.riskConfig,ap=values.appliedProof,appliedAt=values.appliedAt;
  if(cfg&&cfg.length>=6&&q&&q.length>=8&&ap?.length&&appliedAt?.length){
    const good=cfg[5]===3n&&cfg[0]!>0n&&cfg[1]!>0n&&cfg[2]!>0n&&
     cfg[0]!<=q[4]!&&cfg[1]!<=q[5]!&&cfg[2]!<=q[6]!&&cfg[2]!<=cfg[1]!&&cfg[0]!<=5000000000000000000n&&ap[0]===q[0]&&appliedAt[0]===q[2]&&q[0]!==0n;
    checks.riskQualificationBound=good?pass("qualified rule / proof / risk bounds"):fail("RISK_STATUS_PROOF_OR_LIMIT_MISMATCH");
  }else checks.riskQualificationBound=fail("READ_FAILED_OR_REVERTED");
  bool("oracleReportCurrentlyUsable","oracleUsable",true);
  const report=values.oracleReport;
  if(report&&report.length>=14){
    const good=report[0]===BigInt(marketId)&&report[1]===5042n&&
      report[2]!>0n&&report[3]!<=report[2]!&&report[2]!<=report[4]!&&
      report[6]!>=report[7]!&&report[7]!>=2n&&report[12]!>0n&&
      report[10]!>=report[9]!;
    checks.oracleReportEvidence=good?pass("sequence="+short(report[11]!)+" independentSources="+short(report[7]!)):fail("ORACLE_EVIDENCE_INCOMPLETE_STALE_OR_BAD_CHAIN");
  }else checks.oracleReportEvidence=fail("READ_FAILED_OR_REVERTED");
  bool("notSolvencyBlocked","engineSolvency",false);
  addr("engineMarketRegistryWiring","engineMarket",A.market);
  addr("engineRiskWiring","engineRisk",A.risk);
  addr("engineOracleWiring","engineOracle",A.oracle);
  addr("engineMarginWiring","engineMargin",A.margin);
  addr("engineInsuranceWiring","engineInsurance",A.insurance);
  addr("marginEngineWiring","marginEngine",A.engine);
  const custody=values.marginCustody,expected=values.marginExpected;
  checks.marginCustodyReconciled=custody?.length&&expected?.length
   ? (custody[0]===expected[0]?pass("USDC base units="+short(custody[0]!)):fail("CUSTODY_ACCOUNTING_DISCREPANCY",short(custody[0]!)+" / "+short(expected[0]!)))
   :fail("READ_FAILED_OR_REVERTED");
  const debt=values.marginBadDebt;
  checks.noUncoveredBadDebt=debt?.length?(debt[0]===0n?pass("0"):fail("BAD_DEBT_RECORDED",short(debt[0]!))):fail("READ_FAILED_OR_REVERTED");
  const capacity=values.marginWithdrawable;
  checks.liquidityAvailable=capacity?.length?(capacity[0]!>0n?pass("USDC base units="+short(capacity[0]!)):fail("NO_WITHDRAWABLE_MARGIN_BACKING")):fail("READ_FAILED_OR_REVERTED");
  const oi=values.openInterest;
  checks.oiReadable=oi?.length?pass(short(oi[0]!)):fail("READ_FAILED_OR_REVERTED");
  const failed=Object.entries(checks).filter(([,check])=>!check.pass).map(([key,x])=>({check:key,reason:x.reason,evidence:x.evidence}));
  return result({
    marketId,chainId:5042,blockNumber:BigInt(blockTag).toString(10),
    verificationMethod:"DIRECT_ARC_MAINNET_ETH_CALL_AT_SAME_BLOCK",
    version:"v1",source:"evidence/mainnet/contracts.json",
    contractGatePassed:failed.length===0,
    allReleaseGatesPassed:false,
    tradingEnabled:false,lpDepositsEnabled:false,
    status:"BLOCKED",
    checks,failed,
    remainingMandatoryGates:[
      "CANONICAL_MARKET_ID_FROM_ORIGIN_TOKEN",
      "COMPLETE_MARKET_AND_EVENT_INDEX",
      "PROVENANCE_OF_INDEPENDENT_ORACLE_SOURCES",
      "DEPLOYED_BYTECODE_SOURCE_PARITY",
      "FULL_ROLE_AND_TIMELOCK_ATTESTATION",
      "LP_MARGIN_CUSTODY_AND_PNL_INVARIANTS",
      "SIGNED_ORDER_SIMULATION_AND_KEEPER_E2E",
      "INDEPENDENT_FINANCIAL_SECURITY_REVIEW"
    ],
    note:"Full on-chain read checks do not independently authorize trades. Fail closed."
  },200);
 }catch{
  return result({marketId,status:"UNVERIFIED",tradingEnabled:false,lpDepositsEnabled:false,
    error:"ARC_RPC_UNAVAILABLE_OR_INCONSISTENT",checks},503);
 }
}