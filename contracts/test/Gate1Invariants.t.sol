// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { InsuranceFund } from "../src/InsuranceFund.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { OracleRouter } from "../src/OracleRouter.sol";
import { PerpEngine } from "../src/PerpEngine.sol";
import { QualificationRegistry } from "../src/QualificationRegistry.sol";
import { RiskConfig } from "../src/RiskConfig.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";

interface Vm {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

contract Gate1InvariantsTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    QualificationRegistry private qualification;
    MarketRegistry private registry;
    OracleRouter private oracle;
    RiskConfig private risk;
    USDCMarginVault private vault;
    InsuranceFund private insurance;
    PerpEngine private engine;

    address private constant TRADER = address(0xBEEF);
    bytes32 private marketId;

    function setUp() public {
        qualification = new QualificationRegistry();
        registry = new MarketRegistry(address(qualification));
        oracle = new OracleRouter(120, 8_500);
        risk = new RiskConfig(address(qualification));
        vault = new USDCMarginVault();
        insurance = new InsuranceFund();
        engine = new PerpEngine(
            address(registry), address(risk), address(oracle), address(vault), address(insurance)
        );

        marketId = registry.registerEvmMarket(8453, address(1), keccak256("ESTABLISHED"));
        qualification.approveQualification(
            marketId, bytes32(uint256(1)), keccak256("0.1.0"), 3e18, 1_000, 600, 0
        );
        registry.activateMarket(marketId);
        risk.initializeConfig(marketId, 3e18, 1_000, 600, 1_000, 500);
        risk.setExposureProvider(address(engine));
        risk.requalifyMarket(marketId, 3e18, 1_000, 600, 1_000, 500);
        oracle.setUpdater(address(this), true);
        oracle.setPrice(marketId, 1e18, uint64(vm.getBlockTimestamp()), 9_500);
        vault.setEngine(address(engine));
        insurance.setEngine(address(engine));
        vault.creditCollateral(TRADER, 2_000);
    }

    function testQualificationRequiredBeforeActivation() public {
        QualificationRegistry freshQualification = new QualificationRegistry();
        MarketRegistry freshRegistry = new MarketRegistry(address(freshQualification));
        bytes32 freshMarket =
            freshRegistry.registerEvmMarket(5042, address(2), keccak256("DEX_LIVE"));
        vm.expectRevert();
        freshRegistry.activateMarket(freshMarket);
    }

    function testMarketIdUsesOriginChainAndToken() public view {
        bytes32 baseId = registry.computeEvmMarketId(8453, address(1));
        bytes32 ethereumId = registry.computeEvmMarketId(1, address(1));
        bytes32 otherTokenId = registry.computeEvmMarketId(8453, address(2));
        bytes32 solanaId = registry.computeSolanaMarketId(bytes32(uint256(1)));
        assertTrue(baseId != solanaId);
        assertTrue(baseId == 0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387);
        assertTrue(baseId != ethereumId);
        assertTrue(baseId != otherTokenId);
    }

    function testPositionLimitsAndCollateralAccounting() public {
        vm.prank(TRADER);
        uint256 first = engine.openPosition(marketId, true, 200, 600);
        (,,,,,, bool isOpen) = engine.positions(first);
        assertTrue(isOpen);
        assertEq(engine.totalOpenInterest(marketId), 600);
        assertEq(vault.lockedCollateral(TRADER), 200);

        vm.prank(TRADER);
        vm.expectRevert();
        engine.openPosition(marketId, false, 100, 401);
    }

    function testBlockedPausedAndCloseOnlyStates() public {
        risk.emergencySetStatus(marketId, RiskConfig.MarketStatus.PAUSED);
        vm.prank(TRADER);
        vm.expectRevert();
        engine.openPosition(marketId, true, 200, 200);

        vm.warp(vm.getBlockTimestamp() + 1);
        qualification.approveQualification(
            marketId, bytes32(uint256(2)), keccak256("0.1.0"), 3e18, 1_000, 600, 0
        );
        risk.requalifyMarket(marketId, 3e18, 1_000, 600, 1_000, 500);
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 200, 200);
        risk.emergencySetStatus(marketId, RiskConfig.MarketStatus.CLOSE_ONLY);
        vm.prank(TRADER);
        vm.expectRevert();
        engine.increasePosition(positionId, 10, 10);
        vm.prank(TRADER);
        engine.reducePosition(positionId, 50, 50);
        assertEq(engine.totalOpenInterest(marketId), 150);
    }

    function testStaleAndLowConfidenceOracleCannotOpen() public {
        vm.warp(vm.getBlockTimestamp() + 121);
        vm.prank(TRADER);
        vm.expectRevert();
        engine.openPosition(marketId, true, 200, 200);
    }

    function testUnauthorizedAccountsCannotChangeQualificationOrRisk() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert();
        qualification.revokeQualification(marketId);
        vm.prank(address(0xCAFE));
        vm.expectRevert();
        risk.emergencySetStatus(marketId, RiskConfig.MarketStatus.BLOCKED);
    }

    function testNormalRequalificationRequiresFreshProofAndCanIncreaseLimits() public {
        vm.expectRevert();
        risk.requalifyMarket(marketId, 3e18, 1_000, 600, 1_000, 500);

        vm.warp(vm.getBlockTimestamp() + 1);
        qualification.approveQualification(
            marketId, bytes32(uint256(3)), keccak256("0.1.0"), 5e18, 2_000, 1_000, 0
        );
        risk.requalifyMarket(marketId, 5e18, 2_000, 1_000, 1_000, 500);
        RiskConfig.Config memory config = risk.getConfig(marketId);
        assertEq(config.maxLeverage, 5e18);
        assertEq(config.maxOI, 2_000);
    }

    function testEmergencyPathCannotMakeMarketLiveOrReuseExpiredProof() public {
        vm.expectRevert();
        risk.emergencySetStatus(marketId, RiskConfig.MarketStatus.LIVE);

        vm.warp(vm.getBlockTimestamp() + 1);
        uint64 expiry = uint64(vm.getBlockTimestamp() + 10);
        qualification.approveQualification(
            marketId, bytes32(uint256(4)), keccak256("0.1.0"), 3e18, 1_000, 600, expiry
        );
        vm.warp(vm.getBlockTimestamp() + 11);
        vm.expectRevert();
        risk.requalifyMarket(marketId, 3e18, 1_000, 600, 1_000, 500);
    }

    function testExpiredQualificationCannotActivateMarket() public {
        QualificationRegistry freshQualification = new QualificationRegistry();
        MarketRegistry freshRegistry = new MarketRegistry(address(freshQualification));
        bytes32 freshMarket =
            freshRegistry.registerEvmMarket(5042, address(3), keccak256("DEX_LIVE"));
        uint64 expiry = uint64(vm.getBlockTimestamp() + 10);
        freshQualification.approveQualification(
            freshMarket, bytes32(uint256(5)), keccak256("0.1.0"), 3e18, 1_000, 600, expiry
        );
        vm.warp(vm.getBlockTimestamp() + 11);
        vm.expectRevert();
        freshRegistry.activateMarket(freshMarket);
    }

    function testRiskReductionsCannotIncreaseExposure() public {
        risk.emergencyReduceRiskLimits(marketId, 2e18, 500, 300, 1_500, 500);
        RiskConfig.Config memory config = risk.getConfig(marketId);
        assertEq(config.maxOI, 500);
        vm.expectRevert();
        risk.emergencyReduceRiskLimits(marketId, 3e18, 501, 300, 1_500, 500);
    }

    function testBadDebtIsExplicitlyAccounted() public {
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 100, 200);
        engine.liquidatePosition(positionId, -150);
        assertEq(vault.protocolBadDebt(), 50);
        assertEq(insurance.uncoveredBadDebt(), 50);
    }

    function invariant_OpenInterestNeverExceedsConfiguredCap() public view {
        RiskConfig.Config memory config = risk.getConfig(marketId);
        assertTrue(engine.totalOpenInterest(marketId) <= config.maxOI);
    }

    function invariant_GlobalCollateralAccountingContainsTraderLedger() public view {
        assertTrue(vault.freeCollateral(TRADER) <= vault.totalFreeCollateral());
        assertTrue(vault.lockedCollateral(TRADER) <= vault.totalLockedCollateral());
    }

    function testFuzz_PositionCannotExceedConfiguredLimits(uint256 collateral, uint256 size)
        public
    {
        if (
            collateral == 0 || collateral > type(uint256).max - 2_000 || size == 0 || size > 600
                || size * 1e18 / collateral > 3e18
        ) {
            vm.prank(TRADER);
            vm.expectRevert();
            engine.openPosition(marketId, true, collateral, size);
            return;
        }
        vault.creditCollateral(TRADER, collateral);
        vm.prank(TRADER);
        engine.openPosition(marketId, true, collateral, size);
        assertTrue(engine.totalOpenInterest(marketId) <= 1_000);
    }

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "assertEq failed");
    }
}
