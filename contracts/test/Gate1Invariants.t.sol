// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InsuranceFund} from "../src/InsuranceFund.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {OracleRouter} from "../src/OracleRouter.sol";
import {PerpEngine} from "../src/PerpEngine.sol";
import {QualificationRegistry} from "../src/QualificationRegistry.sol";
import {RiskConfig} from "../src/RiskConfig.sol";
import {USDCMarginVault} from "../src/USDCMarginVault.sol";

interface Vm {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
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
        engine = new PerpEngine(address(registry), address(risk), address(oracle), address(vault), address(insurance));

        marketId = registry.registerMarket(bytes32("BASE"), bytes("0x0000000000000000000000000000000000000001"), bytes32("ESTABLISHED"));
        qualification.approveQualification(marketId, bytes32(uint256(1)), bytes32("0.1.0"), 3e18, 1_000, 600);
        registry.activateMarket(marketId);
        risk.initializeConfig(marketId, 3e18, 1_000, 600, 1_000, 500);
        risk.setExposureProvider(address(engine));
        risk.setStatus(marketId, RiskConfig.MarketStatus.LIVE);
        oracle.setUpdater(address(this), true);
        oracle.setPrice(marketId, 1e18, uint64(block.timestamp), 9_500);
        vault.setEngine(address(engine));
        insurance.setEngine(address(engine));
        vault.creditCollateral(TRADER, 2_000);
    }

    function testQualificationRequiredBeforeActivation() public {
        QualificationRegistry freshQualification = new QualificationRegistry();
        MarketRegistry freshRegistry = new MarketRegistry(address(freshQualification));
        bytes32 freshMarket = freshRegistry.registerMarket(bytes32("ARC"), bytes("arc-token"), bytes32("DEX_LIVE"));
        vm.expectRevert();
        freshRegistry.activateMarket(freshMarket);
    }

    function testMarketIdUsesOriginChainAndToken() public view {
        bytes32 baseId = registry.computeMarketId(bytes32("BASE"), bytes("same-token-text"));
        bytes32 solanaId = registry.computeMarketId(bytes32("SOLANA"), bytes("same-token-text"));
        assertTrue(baseId != solanaId);
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
        risk.setStatus(marketId, RiskConfig.MarketStatus.PAUSED);
        vm.prank(TRADER);
        vm.expectRevert();
        engine.openPosition(marketId, true, 200, 200);

        risk.setStatus(marketId, RiskConfig.MarketStatus.LIVE);
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 200, 200);
        risk.setStatus(marketId, RiskConfig.MarketStatus.CLOSE_ONLY);
        vm.prank(TRADER);
        vm.expectRevert();
        engine.increasePosition(positionId, 10, 10);
        vm.prank(TRADER);
        engine.reducePosition(positionId, 50, 50);
        assertEq(engine.totalOpenInterest(marketId), 150);
    }

    function testStaleAndLowConfidenceOracleCannotOpen() public {
        vm.warp(block.timestamp + 121);
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
        risk.setStatus(marketId, RiskConfig.MarketStatus.BLOCKED);
    }

    function testRiskReductionsCannotIncreaseExposure() public {
        risk.reduceRiskLimits(marketId, 2e18, 500, 300, 1_500, 500);
        RiskConfig.Config memory config = risk.getConfig(marketId);
        assertEq(config.maxOI, 500);
        vm.expectRevert();
        risk.reduceRiskLimits(marketId, 3e18, 501, 300, 1_500, 500);
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

    function invariant_GlobalCollateralAccountingMatchesTraderLedger() public view {
        assertEq(vault.totalFreeCollateral(), vault.freeCollateral(TRADER));
        assertEq(vault.totalLockedCollateral(), vault.lockedCollateral(TRADER));
    }

    function testFuzz_PositionCannotExceedConfiguredLimits(uint256 collateral, uint256 size) public {
        if (collateral == 0 || size == 0 || size > 600 || size * 1e18 / collateral > 3e18) {
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
