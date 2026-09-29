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
    address private constant DEFAULT_REPORTER_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address private constant DEFAULT_REPORTER_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address private constant DEFAULT_REPORTER_3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    bytes32 private constant MARKET_LIFECYCLE = keccak256("TESTNET_CANARY");
    bytes32 private constant QUALIFICATION_HASH = bytes32(uint256(1));
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
        address usdc = vm.envOr("ARC_TESTNET_USDC_ADDRESS", DEFAULT_USDC);
        address reporter1 = vm.envOr("REPORTER_1_ADDRESS", DEFAULT_REPORTER_1);
        address reporter2 = vm.envOr("REPORTER_2_ADDRESS", DEFAULT_REPORTER_2);
        address reporter3 = vm.envOr("REPORTER_3_ADDRESS", DEFAULT_REPORTER_3);

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
        engine.setOrderKeeper(msg.sender, true);
        engine.setLiquidationKeeper(msg.sender, true);

        oracle.setReporter(reporter1, true);
        oracle.setReporter(reporter2, true);
        oracle.setReporter(reporter3, true);
        oracle.setReporterThreshold(2, REPORTER_SET_VERSION);

        bytes32 marketId = registry.registerEvmMarket(8453, address(1), MARKET_LIFECYCLE);
        qualification.approveQualification(
            marketId, QUALIFICATION_HASH, RULE_VERSION, 2e18, 10_000_000, 2_000_000, 0
        );
        registry.activateMarket(marketId);
        risk.initializeConfig(marketId, 2e18, 10_000_000, 2_000_000, 1_500, 500);
        risk.setExposureProvider(address(engine));
        risk.requalifyMarket(marketId, 2e18, 10_000_000, 2_000_000, 1_500, 500);

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
            10_000
        );
        engine.setMarketSideCaps(marketId, 5_000_000, 5_000_000);
        engine.setSkewConfig(8e17, 5e14);

        IERC20(usdc).approve(address(vault), 500_000_000);
        vault.fundProtocolBacking(500_000_000);
        IERC20(usdc).approve(address(insurance), 100_000_000);
        insurance.fund(100_000_000);
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
}
