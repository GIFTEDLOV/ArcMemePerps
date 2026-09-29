// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EconomicModel } from "../src/EconomicModel.sol";
import { IERC20 } from "../src/IERC20.sol";
import { InsuranceFund } from "../src/InsuranceFund.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { OracleRouter } from "../src/OracleRouter.sol";
import { PerpEngine } from "../src/PerpEngine.sol";
import { QualificationRegistry } from "../src/QualificationRegistry.sol";
import { RiskConfig } from "../src/RiskConfig.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";

interface VmGate4Script {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata key, address defaultValue) external returns (address);
    function envOr(string calldata key, bytes32 defaultValue) external returns (bytes32);
    function envOr(string calldata key, uint256 defaultValue) external returns (uint256);
}

/**
 * Controlled Gate 4 deployment script.
 *
 * The script is intentionally explicit and only supports a testnet/local canary market. It
 * does not contain a private key; the caller supplies one to the Arc Foundry command. The
 * same script can be dry-run with `--sig run()` without broadcasting.
 */
contract DeployGate4 {
    VmGate4Script private constant vm =
        VmGate4Script(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant DEFAULT_USDC = 0x3600000000000000000000000000000000000000;
    uint256 private constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    bytes32 private constant MARKET_LIFECYCLE = keccak256("TESTNET_CANARY");
    bytes32 private constant RULE_VERSION = keccak256("0.1.0");
    bytes32 private constant REPORTER_SET_VERSION = keccak256("testnet-reporters-v1");

    event Gate4Deployed(
        address qualificationRegistry,
        address marketRegistry,
        address oracleRouter,
        address riskConfig,
        address marginVault,
        address perpEngine,
        address insuranceFund,
        address usdc,
        bytes32 marketId
    );

    function run() external {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert WrongChain();

        address usdc = vm.envOr("ARC_TESTNET_USDC_ADDRESS", DEFAULT_USDC);
        address reporter1 = vm.envOr("REPORTER_1_ADDRESS", address(0));
        address reporter2 = vm.envOr("REPORTER_2_ADDRESS", address(0));
        address reporter3 = vm.envOr("REPORTER_3_ADDRESS", address(0));
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0));
        address liquidator = vm.envOr("LIQUIDATOR_ADDRESS", address(0));
        bytes32 qualificationHash =
            vm.envOr("QUALIFICATION_HASH", keccak256("ARCMEMEPERPS_TESTNET_CANARY_PROOF_V2"));
        uint256 maxLeverage = vm.envOr("TESTNET_MAX_LEVERAGE_WAD", 2e18);
        uint256 maxOI = vm.envOr("TESTNET_MAX_OI_BASE_UNITS", 1_000_000);
        uint256 maxPosition = vm.envOr("TESTNET_MAX_POSITION_BASE_UNITS", 200_000);
        uint256 maxLongOI = vm.envOr("TESTNET_MAX_LONG_OI_BASE_UNITS", 500_000);
        uint256 maxShortOI = vm.envOr("TESTNET_MAX_SHORT_OI_BASE_UNITS", 500_000);
        uint256 maintenanceMarginBps = vm.envOr("TESTNET_MAINTENANCE_MARGIN_BPS", 2_500);
        uint256 liquidationPenaltyBps = vm.envOr("TESTNET_LIQUIDATION_PENALTY_BPS", 500);
        uint256 backing = vm.envOr("INITIAL_VAULT_BACKING_BASE_UNITS", 5_000_000);
        uint256 insuranceCapital = vm.envOr("INITIAL_INSURANCE_BASE_UNITS", 2_000_000);
        uint256 liquidationReward = vm.envOr("LIQUIDATION_REWARD_BASE_UNITS", 1_000);
        uint256 originChainId = vm.envOr("ORIGIN_CHAIN_ID", 8453);
        address originToken =
            vm.envOr("ORIGIN_TOKEN_ADDRESS", 0x0000000000000000000000000000000000000001);
        if (
            reporter1 == address(0) || reporter2 == address(0) || reporter3 == address(0)
                || keeper == address(0) || liquidator == address(0)
                || qualificationHash == bytes32(0)
        ) revert MissingTestnetIdentity();
        if (
            maxLeverage == 0 || maxLeverage > 5e18 || maxOI == 0 || maxPosition == 0
                || maxPosition > maxOI || maxLongOI == 0 || maxShortOI == 0 || maxLongOI > maxOI
                || maxShortOI > maxOI || backing == 0 || insuranceCapital == 0
        ) revert InvalidCanaryConfiguration();

        vm.startBroadcast();
        QualificationRegistry qualification = new QualificationRegistry();
        MarketRegistry registry = new MarketRegistry(address(qualification));
        OracleRouter oracle = new OracleRouter(120, 8_500);
        RiskConfig risk = new RiskConfig(address(qualification));
        USDCMarginVault vault = new USDCMarginVault();
        InsuranceFund insurance = new InsuranceFund();
        PerpEngine engine = new PerpEngine(
            address(registry), address(risk), address(oracle), address(vault), address(insurance)
        );

        vault.setCollateralToken(usdc);
        vault.setEngine(address(engine));
        insurance.setCollateralToken(usdc);
        insurance.setEngine(address(engine));
        engine.setOrderKeeper(keeper, true);
        engine.setLiquidationKeeper(liquidator, true);

        oracle.setReporter(reporter1, true);
        oracle.setReporter(reporter2, true);
        oracle.setReporter(reporter3, true);
        oracle.setReporterThreshold(2, REPORTER_SET_VERSION);

        bytes32 marketId = registry.registerEvmMarket(originChainId, originToken, MARKET_LIFECYCLE);
        qualification.approveQualification(
            marketId, qualificationHash, RULE_VERSION, maxLeverage, maxOI, maxPosition, 0
        );
        registry.activateMarket(marketId);
        risk.initializeConfig(
            marketId, maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps
        );
        risk.setExposureProvider(address(engine));
        risk.requalifyMarket(
            marketId, maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps
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

        IERC20(usdc).approve(address(vault), backing);
        vault.fundProtocolBacking(backing);
        IERC20(usdc).approve(address(insurance), insuranceCapital);
        insurance.fund(insuranceCapital);
        vm.stopBroadcast();

        emit Gate4Deployed(
            address(qualification),
            address(registry),
            address(oracle),
            address(risk),
            address(vault),
            address(engine),
            address(insurance),
            usdc,
            marketId
        );
    }

    error WrongChain();
    error MissingTestnetIdentity();
    error InvalidCanaryConfiguration();
}
