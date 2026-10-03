// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "../src/AccessControlled.sol";
import { ADLController, IAdlEngine } from "../src/ADLController.sol";
import { IERC20 } from "../src/IERC20.sol";
import { InsuranceFund } from "../src/InsuranceFund.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { OracleRouter } from "../src/OracleRouter.sol";
import { PerpEngine } from "../src/PerpEngine.sol";
import { ProtocolTimelock } from "../src/ProtocolTimelock.sol";
import { PublicLPVault } from "../src/PublicLPVault.sol";
import { QualificationRegistry } from "../src/QualificationRegistry.sol";
import { RiskConfig } from "../src/RiskConfig.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmGate4G0 {
    function expectRevert() external;
    function getBlockTimestamp() external view returns (uint256);
    function mint(address account, uint256 amount) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract Gate4G0DeploymentTest {
    VmGate4G0 private constant vm =
        VmGate4G0(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant GOVERNANCE_ADMIN_ROLE = keccak256("GOVERNANCE_ADMIN");
    bytes32 private constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN");
    bytes32 private constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN");
    bytes32 private constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN");
    bytes32 private constant QUALIFICATION_WRITER_ROLE = keccak256("QUALIFICATION_WRITER");
    bytes32 private constant KEEPER_ROLE = keccak256("KEEPER");
    bytes32 private constant INSURANCE_MANAGER_ROLE = keccak256("INSURANCE_MANAGER");

    address private constant RISK = address(0x1001);
    address private constant GOVERNANCE = address(0x1000);
    address private constant EMERGENCY = address(0x1002);
    address private constant ORACLE_ADMIN = address(0x1003);
    address private constant QUALIFICATION = address(0x1004);
    address private constant KEEPER = address(0x1005);
    address private constant INSURANCE = address(0x1006);
    address private constant REPORTER_1 = address(0x1007);
    address private constant REPORTER_2 = address(0x1008);
    address private constant REPORTER_3 = address(0x1009);
    address private constant LP_2 = address(0x100A);

    function testCompleteV2GraphAndGovernedLpActivation() public {
        MockUSDC usdc = new MockUSDC();
        QualificationRegistry qualification = new QualificationRegistry();
        MarketRegistry registry = new MarketRegistry(address(qualification));
        OracleRouter oracle = new OracleRouter(120, 8_500);
        RiskConfig risk = new RiskConfig(address(qualification));
        USDCMarginVault marginVault = new USDCMarginVault();
        InsuranceFund insurance = new InsuranceFund();
        PerpEngine engine = new PerpEngine(
            address(registry),
            address(risk),
            address(oracle),
            address(marginVault),
            address(insurance)
        );
        PublicLPVault publicLp = new PublicLPVault(address(usdc), 10);
        ADLController adl = new ADLController(address(engine));
        ProtocolTimelock timelock = new ProtocolTimelock(10);

        _configure(
            qualification,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            registry,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            oracle,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            risk, address(timelock), RISK, EMERGENCY, ORACLE_ADMIN, QUALIFICATION, KEEPER, INSURANCE
        );
        _configure(
            marginVault,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            insurance,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            engine,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            publicLp,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );
        _configure(
            adl, address(timelock), RISK, EMERGENCY, ORACLE_ADMIN, QUALIFICATION, KEEPER, INSURANCE
        );
        _configure(
            timelock,
            address(timelock),
            RISK,
            EMERGENCY,
            ORACLE_ADMIN,
            QUALIFICATION,
            KEEPER,
            INSURANCE
        );

        marginVault.setCollateralToken(address(usdc));
        marginVault.setEngine(address(engine));
        insurance.setCollateralToken(address(usdc));
        insurance.setEngine(address(engine));
        risk.setExposureProvider(address(engine));
        publicLp.setRiskController(address(RISK));
        engine.setADLController(address(adl));
        engine.setOrderKeeper(KEEPER, true);
        engine.setLiquidationKeeper(KEEPER, true);
        adl.setKeeper(KEEPER);

        oracle.setReporter(REPORTER_1, true);
        oracle.setReporter(REPORTER_2, true);
        oracle.setReporter(REPORTER_3, true);
        oracle.setReporterThreshold(2, keccak256("testnet-reporters-v2"));

        bytes32 marketId =
            registry.registerEvmMarket(8453, address(0xBEEF), keccak256("TESTNET_CANARY_V2"));
        qualification.approveQualification(
            marketId,
            keccak256("ARCMEMEPERPS_TESTNET_CANARY_PROOF_V2"),
            keccak256("0.1.0"),
            2e18,
            1_000_000,
            200_000,
            0
        );
        risk.initializeConfig(marketId, 2e18, 1_000_000, 200_000, 2_500, 500);
        risk.requalifyMarket(marketId, 2e18, 1_000_000, 200_000, 2_500, 500);
        registry.activateMarket(marketId);

        _finalize(qualification);
        _finalize(registry);
        _finalize(oracle);
        _finalize(risk);
        _finalize(marginVault);
        _finalize(insurance);
        _finalize(engine);
        _finalize(publicLp);
        _finalize(adl);
        _finalize(timelock);

        require(address(registry.qualificationRegistry()) == address(qualification));
        require(address(risk.qualificationRegistry()) == address(qualification));
        require(address(engine.marginVault()) == address(marginVault));
        require(address(engine.insuranceFund()) == address(insurance));
        require(engine.adlController() == address(adl));
        require(adl.engine() == IAdlEngine(address(engine)));
        require(publicLp.riskController() == RISK);
        require(!publicLp.publicLpActive());

        IERC20(address(usdc)).approve(address(publicLp), type(uint256).max);
        usdc.mint(address(this), 1_000_000);
        vm.expectRevert();
        publicLp.deposit(500_000);

        bytes memory activation = abi.encodeCall(PublicLPVault.setPublicLpActive, (true));
        bytes32 salt = keccak256("lp-activation");
        vm.prank(GOVERNANCE);
        timelock.queue(address(publicLp), 0, activation, salt);
        vm.expectRevert();
        timelock.execute(address(publicLp), 0, activation, salt);
        vm.warp(vm.getBlockTimestamp() + 10);
        timelock.execute(address(publicLp), 0, activation, salt);
        require(publicLp.publicLpActive());
        require(publicLp.deposit(500_000) == 500_000);

        usdc.mint(LP_2, 500_000);
        vm.prank(LP_2);
        usdc.approve(address(publicLp), 500_000);
        vm.prank(LP_2);
        require(publicLp.deposit(500_000) == 500_000);
        require(publicLp.totalShares() == 1_000_000);
    }

    function _configure(
        AccessControlled target,
        address timelock,
        address risk,
        address emergency,
        address oracleAdmin,
        address qualificationWriter,
        address keeper,
        address insuranceManager
    ) private {
        target.setRole(GOVERNANCE_ADMIN_ROLE, GOVERNANCE, true);
        target.setRole(RISK_ADMIN_ROLE, risk, true);
        target.setRole(EMERGENCY_ADMIN_ROLE, emergency, true);
        target.setRole(ORACLE_ADMIN_ROLE, oracleAdmin, true);
        target.setRole(QUALIFICATION_WRITER_ROLE, qualificationWriter, true);
        target.setRole(KEEPER_ROLE, keeper, true);
        target.setRole(INSURANCE_MANAGER_ROLE, insuranceManager, true);
        target.setGovernanceExecutor(timelock);
    }

    function _finalize(AccessControlled target) private {
        target.finalizeBootstrap();
    }
}
