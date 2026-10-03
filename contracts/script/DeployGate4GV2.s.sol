// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "../src/AccessControlled.sol";
import { ADLController } from "../src/ADLController.sol";
import { EconomicModel } from "../src/EconomicModel.sol";
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
import { IQualificationRegistry } from "../src/interfaces/IQualificationRegistry.sol";
import { IRiskConfig } from "../src/interfaces/IRiskConfig.sol";

interface VmGate4GV2 {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata key, address defaultValue) external returns (address);
    function envOr(string calldata key, bytes32 defaultValue) external returns (bytes32);
    function envOr(string calldata key, uint256 defaultValue) external returns (uint256);
    function getDeployedCode(string calldata artifact) external returns (bytes memory);
}

/**
 * Frozen-suite Arc Testnet V2 deployment path.
 *
 * The script intentionally contains no private key. The operator supplies an encrypted
 * keystore/account to Arc Forge. Existing addresses may be supplied through V2_*_ADDRESS
 * variables to resume a safely interrupted deployment; an address is reused only when code
 * already exists there. The script always validates the Arc chain and canonical USDC before
 * starting a broadcast.
 */
contract DeployGate4GV2 {
    VmGate4GV2 private constant vm =
        VmGate4GV2(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant DEFAULT_USDC = 0x3600000000000000000000000000000000000000;
    uint256 private constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    uint256 private constant USDC_DECIMALS = 6;
    bytes32 private constant CANARY_LIFECYCLE = keccak256("TESTNET_CANARY_V2");
    bytes32 private constant RULE_VERSION = keccak256("0.1.0");
    bytes32 private constant REPORTER_SET_VERSION = keccak256("testnet-reporters-v2");
    bytes32 private constant DEFAULT_PROOF = keccak256("ARCMEMEPERPS_TESTNET_CANARY_PROOF_V2");

    bytes32 private constant GOVERNANCE_ADMIN_ROLE = keccak256("GOVERNANCE_ADMIN");
    bytes32 private constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN");
    bytes32 private constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN");
    bytes32 private constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN");
    bytes32 private constant QUALIFICATION_WRITER_ROLE = keccak256("QUALIFICATION_WRITER");
    bytes32 private constant KEEPER_ROLE = keccak256("KEEPER");
    bytes32 private constant INSURANCE_MANAGER_ROLE = keccak256("INSURANCE_MANAGER");

    event Gate4GV2Deployed(
        address qualificationRegistry,
        address marketRegistry,
        address oracleRouter,
        address riskConfig,
        address marginVault,
        address perpEngine,
        address insuranceFund,
        address publicLpVault,
        address adlController,
        address governanceTimelock,
        address usdc,
        bytes32 marketId
    );

    function run() external {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert WrongChain();

        address usdc = vm.envOr("ARC_TESTNET_USDC_ADDRESS", DEFAULT_USDC);
        _verifyUsdc(usdc);

        address governanceAdmin = vm.envOr("GOVERNANCE_ADMIN_ADDRESS", address(0));
        address riskAdmin = vm.envOr("RISK_ADMIN_ADDRESS", address(0));
        address emergencyAdmin = vm.envOr("EMERGENCY_ADMIN_ADDRESS", address(0));
        address oracleAdmin = vm.envOr("ORACLE_ADMIN_ADDRESS", address(0));
        address qualificationWriter = vm.envOr("QUALIFICATION_WRITER_ADDRESS", address(0));
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0));
        address insuranceManager = vm.envOr("INSURANCE_MANAGER_ADDRESS", address(0));
        address lpRiskController = vm.envOr("LP_RISK_CONTROLLER_ADDRESS", riskAdmin);
        address reporter1 = vm.envOr("REPORTER_1_ADDRESS", address(0));
        address reporter2 = vm.envOr("REPORTER_2_ADDRESS", address(0));
        address reporter3 = vm.envOr("REPORTER_3_ADDRESS", address(0));

        _requireActors(
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager,
            lpRiskController,
            reporter1,
            reporter2,
            reporter3
        );

        uint256 minDelay = vm.envOr("GOVERNANCE_MIN_DELAY_SECONDS", 60);
        uint256 withdrawalCooldown = vm.envOr("LP_WITHDRAWAL_COOLDOWN_SECONDS", 60);
        uint256 backing = vm.envOr("INITIAL_VAULT_BACKING_BASE_UNITS", 5_000_000);
        uint256 insuranceCapital = vm.envOr("INITIAL_INSURANCE_BASE_UNITS", 2_000_000);
        uint256 maxLeverage = vm.envOr("TESTNET_MAX_LEVERAGE_WAD", 2e18);
        uint256 maxOI = vm.envOr("TESTNET_MAX_OI_BASE_UNITS", 1_000_000);
        uint256 maxPosition = vm.envOr("TESTNET_MAX_POSITION_BASE_UNITS", 200_000);
        uint256 maxLongOI = vm.envOr("TESTNET_MAX_LONG_OI_BASE_UNITS", 500_000);
        uint256 maxShortOI = vm.envOr("TESTNET_MAX_SHORT_OI_BASE_UNITS", 500_000);
        uint256 maintenanceMarginBps = vm.envOr("TESTNET_MAINTENANCE_MARGIN_BPS", 2_500);
        uint256 liquidationPenaltyBps = vm.envOr("TESTNET_LIQUIDATION_PENALTY_BPS", 500);
        uint256 liquidationReward = vm.envOr("LIQUIDATION_REWARD_BASE_UNITS", 1_000);
        uint256 originChainId = vm.envOr("ORIGIN_CHAIN_ID", 8453);
        address originToken =
            vm.envOr("ORIGIN_TOKEN_ADDRESS", 0x0000000000000000000000000000000000000001);
        bytes32 proofHash = vm.envOr("QUALIFICATION_HASH", DEFAULT_PROOF);

        if (
            minDelay == 0 || maxLeverage == 0 || maxLeverage > 5e18 || maxOI == 0
                || maxPosition == 0 || maxPosition > maxOI || maxLongOI == 0 || maxShortOI == 0
                || maxLongOI > maxOI || maxShortOI > maxOI || backing == 0 || insuranceCapital == 0
                || originChainId == 0 || originToken == address(0) || proofHash == bytes32(0)
        ) revert InvalidCanaryConfiguration();

        vm.startBroadcast();

        QualificationRegistry qualification = _qualification();
        MarketRegistry registry = _marketRegistry(address(qualification));
        OracleRouter oracle = _oracle();
        RiskConfig risk = _risk(address(qualification));
        USDCMarginVault marginVault = _marginVault();
        InsuranceFund insurance = _insurance();
        PerpEngine engine = _engine(
            address(registry),
            address(risk),
            address(oracle),
            address(marginVault),
            address(insurance)
        );
        PublicLPVault publicLp = _publicLp(usdc, withdrawalCooldown);
        ADLController adl = _adl(address(engine));
        ProtocolTimelock timelock = _timelock(minDelay);

        _configureAccess(
            qualification,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            registry,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            oracle,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            risk,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            marginVault,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            insurance,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            engine,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            publicLp,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            adl,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );
        _configureAccess(
            timelock,
            address(timelock),
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager
        );

        marginVault.setCollateralToken(usdc);
        marginVault.setEngine(address(engine));
        insurance.setCollateralToken(usdc);
        insurance.setEngine(address(engine));
        risk.setExposureProvider(address(engine));
        publicLp.setRiskController(lpRiskController);
        engine.setADLController(address(adl));
        engine.setOrderKeeper(keeper, true);
        engine.setLiquidationKeeper(keeper, true);
        adl.setKeeper(keeper);

        oracle.setReporter(reporter1, true);
        oracle.setReporter(reporter2, true);
        oracle.setReporter(reporter3, true);
        if (oracle.reporterSetVersion() != REPORTER_SET_VERSION) {
            oracle.setReporterThreshold(2, REPORTER_SET_VERSION);
        }
        if (
            oracle.maxStaleness() != 120 || oracle.minimumConfidenceBps() != 8_500
                || oracle.minimumIndependentSources() != 2
        ) {
            oracle.setPolicy(120, 8_500, 2);
        }

        bytes32 marketId = _configureMarket(
            registry,
            qualification,
            risk,
            originChainId,
            originToken,
            proofHash,
            maxLeverage,
            maxOI,
            maxPosition,
            maintenanceMarginBps,
            liquidationPenaltyBps
        );
        engine.setEconomicConfig(
            EconomicModel.FundingConfig({
                factorPerSecondWad: 1e12, capPerSecondWad: 1e13, minimumDenominatorUsdWad: 1e18
            }),
            EconomicModel.BorrowConfig({
                baseRatePerSecondWad: 1e9,
                slopePerSecondWad: 2e9,
                kinkUtilizationWad: 8e17,
                maxRatePerSecondWad: 2_500_000_000
            }),
            PerpEngine.FeeConfig({
                openFeeRateWad: 1e15, closeFeeRateWad: 1e15, insuranceShareBps: 2_000
            }),
            liquidationReward
        );
        engine.setMarketSideCaps(marketId, maxLongOI, maxShortOI);
        engine.setSkewConfig(8e17, 5e14);

        _fundBacking(marginVault, insurance, usdc, backing, insuranceCapital);

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

        vm.stopBroadcast();

        emit Gate4GV2Deployed(
            address(qualification),
            address(registry),
            address(oracle),
            address(risk),
            address(marginVault),
            address(engine),
            address(insurance),
            address(publicLp),
            address(adl),
            address(timelock),
            usdc,
            marketId
        );
    }

    function _verifyUsdc(address usdc) private view {
        if (usdc == address(0) || usdc.code.length == 0) revert InvalidUsdc();
        (bool success, bytes memory data) = usdc.staticcall(abi.encodeWithSignature("decimals()"));
        if (!success || data.length < 32 || abi.decode(data, (uint256)) != USDC_DECIMALS) {
            revert InvalidUsdc();
        }
    }

    function _requireActors(
        address governanceAdmin,
        address riskAdmin,
        address emergencyAdmin,
        address oracleAdmin,
        address qualificationWriter,
        address keeper,
        address insuranceManager,
        address lpRiskController,
        address reporter1,
        address reporter2,
        address reporter3
    ) private pure {
        address[11] memory actors = [
            governanceAdmin,
            riskAdmin,
            emergencyAdmin,
            oracleAdmin,
            qualificationWriter,
            keeper,
            insuranceManager,
            lpRiskController,
            reporter1,
            reporter2,
            reporter3
        ];
        for (uint256 i = 0; i < actors.length; i++) {
            if (actors[i] == address(0)) revert MissingActor();
            for (uint256 j = 0; j < i; j++) {
                if (actors[i] == actors[j]) revert DuplicateActor();
            }
        }
    }

    function _configureAccess(
        AccessControlled target,
        address timelock,
        address governanceAdmin,
        address riskAdmin,
        address emergencyAdmin,
        address oracleAdmin,
        address qualificationWriter,
        address keeper,
        address insuranceManager
    ) private {
        if (!target.bootstrapFinalized()) {
            target.setRole(GOVERNANCE_ADMIN_ROLE, governanceAdmin, true);
            target.setRole(RISK_ADMIN_ROLE, riskAdmin, true);
            target.setRole(EMERGENCY_ADMIN_ROLE, emergencyAdmin, true);
            target.setRole(ORACLE_ADMIN_ROLE, oracleAdmin, true);
            target.setRole(QUALIFICATION_WRITER_ROLE, qualificationWriter, true);
            target.setRole(KEEPER_ROLE, keeper, true);
            target.setRole(INSURANCE_MANAGER_ROLE, insuranceManager, true);
            target.setGovernanceExecutor(timelock);
        }
    }

    function _configureMarket(
        MarketRegistry registry,
        QualificationRegistry qualification,
        RiskConfig risk,
        uint256 originChainId,
        address originToken,
        bytes32 proofHash,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint256 maintenanceMarginBps,
        uint256 liquidationPenaltyBps
    ) private returns (bytes32 marketId) {
        marketId = registry.computeEvmMarketId(originChainId, originToken);
        if (!registry.marketExists(marketId)) {
            marketId = registry.registerEvmMarket(originChainId, originToken, CANARY_LIFECYCLE);
        }
        IQualificationRegistry.Qualification memory current =
            qualification.getQualification(marketId);
        if (!current.approved || current.proofHash != proofHash) {
            qualification.approveQualification(
                marketId, proofHash, RULE_VERSION, maxLeverage, maxOI, maxPosition, 0
            );
        }
        try risk.getConfig(marketId) returns (IRiskConfig.Config memory) { }
        catch {
            risk.initializeConfig(
                marketId,
                maxLeverage,
                maxOI,
                maxPosition,
                maintenanceMarginBps,
                liquidationPenaltyBps
            );
        }
        if (!risk.canIncreaseExposure(marketId)) {
            risk.requalifyMarket(
                marketId,
                maxLeverage,
                maxOI,
                maxPosition,
                maintenanceMarginBps,
                liquidationPenaltyBps
            );
        }
        if (registry.marketState(marketId) != 3) registry.activateMarket(marketId);
    }

    function _fundBacking(
        USDCMarginVault marginVault,
        InsuranceFund insurance,
        address usdc,
        uint256 backing,
        uint256 insuranceCapital
    ) private {
        uint256 currentBacking = marginVault.protocolBacking();
        if (currentBacking < backing) {
            uint256 amount = backing - currentBacking;
            IERC20(usdc).approve(address(marginVault), amount);
            marginVault.fundProtocolBacking(amount);
        }
        uint256 currentInsurance = insurance.availableCapital();
        if (currentInsurance < insuranceCapital) {
            uint256 amount = insuranceCapital - currentInsurance;
            IERC20(usdc).approve(address(insurance), amount);
            insurance.fund(amount);
        }
    }

    function _finalize(AccessControlled target) private {
        if (!target.bootstrapFinalized()) target.finalizeBootstrap();
    }

    function _qualification() private returns (QualificationRegistry deployed) {
        address existing = vm.envOr("V2_QUALIFICATION_REGISTRY_ADDRESS", address(0));
        if (existing.code.length == 0) return new QualificationRegistry();
        _assertRuntime(existing, "QualificationRegistry.sol:QualificationRegistry");
        return QualificationRegistry(existing);
    }

    function _marketRegistry(address qualification) private returns (MarketRegistry deployed) {
        address existing = vm.envOr("V2_MARKET_REGISTRY_ADDRESS", address(0));
        if (existing.code.length == 0) return new MarketRegistry(qualification);
        _assertRuntime(existing, "MarketRegistry.sol:MarketRegistry");
        return MarketRegistry(existing);
    }

    function _oracle() private returns (OracleRouter deployed) {
        address existing = vm.envOr("V2_ORACLE_ROUTER_ADDRESS", address(0));
        if (existing.code.length == 0) return new OracleRouter(120, 8_500);
        _assertRuntime(existing, "OracleRouter.sol:OracleRouter");
        return OracleRouter(existing);
    }

    function _risk(address qualification) private returns (RiskConfig deployed) {
        address existing = vm.envOr("V2_RISK_CONFIG_ADDRESS", address(0));
        if (existing.code.length == 0) return new RiskConfig(qualification);
        _assertRuntime(existing, "RiskConfig.sol:RiskConfig");
        return RiskConfig(existing);
    }

    function _marginVault() private returns (USDCMarginVault deployed) {
        address existing = vm.envOr("V2_USDC_MARGIN_VAULT_ADDRESS", address(0));
        if (existing.code.length == 0) return new USDCMarginVault();
        _assertRuntime(existing, "USDCMarginVault.sol:USDCMarginVault");
        return USDCMarginVault(existing);
    }

    function _insurance() private returns (InsuranceFund deployed) {
        address existing = vm.envOr("V2_INSURANCE_FUND_ADDRESS", address(0));
        if (existing.code.length == 0) return new InsuranceFund();
        _assertRuntime(existing, "InsuranceFund.sol:InsuranceFund");
        return InsuranceFund(existing);
    }

    function _engine(
        address registry,
        address risk,
        address oracle,
        address vault,
        address insurance
    ) private returns (PerpEngine deployed) {
        address existing = vm.envOr("V2_PERP_ENGINE_ADDRESS", address(0));
        if (existing.code.length == 0) {
            return new PerpEngine(registry, risk, oracle, vault, insurance);
        }
        _assertRuntime(existing, "PerpEngine.sol:PerpEngine");
        return PerpEngine(existing);
    }

    function _publicLp(address usdc, uint256 cooldown) private returns (PublicLPVault deployed) {
        address existing = vm.envOr("V2_PUBLIC_LP_VAULT_ADDRESS", address(0));
        if (existing.code.length == 0) return new PublicLPVault(usdc, cooldown);
        _assertRuntime(existing, "PublicLPVault.sol:PublicLPVault");
        return PublicLPVault(existing);
    }

    function _adl(address engine) private returns (ADLController deployed) {
        address existing = vm.envOr("V2_ADL_CONTROLLER_ADDRESS", address(0));
        if (existing.code.length == 0) return new ADLController(engine);
        _assertRuntime(existing, "ADLController.sol:ADLController");
        return ADLController(existing);
    }

    function _timelock(uint256 minDelay) private returns (ProtocolTimelock deployed) {
        address existing = vm.envOr("V2_GOVERNANCE_TIMELOCK_ADDRESS", address(0));
        if (existing.code.length == 0) return new ProtocolTimelock(minDelay);
        _assertRuntime(existing, "ProtocolTimelock.sol:ProtocolTimelock");
        return ProtocolTimelock(existing);
    }

    function _assertRuntime(address existing, string memory artifact) private {
        bytes memory expectedRuntime = vm.getDeployedCode(artifact);
        if (expectedRuntime.length == 0 || keccak256(existing.code) != keccak256(expectedRuntime)) {
            revert RuntimeBytecodeMismatch();
        }
    }

    error WrongChain();
    error InvalidUsdc();
    error MissingActor();
    error DuplicateActor();
    error InvalidCanaryConfiguration();
    error RuntimeBytecodeMismatch();
}
