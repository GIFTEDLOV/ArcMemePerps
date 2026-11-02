// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { InsuranceFund } from "../src/InsuranceFund.sol";
import { EconomicModel } from "../src/EconomicModel.sol";
import { IOracleRouter } from "../src/interfaces/IOracleRouter.sol";
import { IUSDCMarginVault } from "../src/interfaces/IUSDCMarginVault.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { OracleRouter } from "../src/OracleRouter.sol";
import { PerpEngine } from "../src/PerpEngine.sol";
import { PublicLPVault } from "../src/PublicLPVault.sol";
import { QualificationRegistry } from "../src/QualificationRegistry.sol";
import { RiskConfig } from "../src/RiskConfig.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmGate4 {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

contract Gate4SettlementTest {
    VmGate4 private constant vm = VmGate4(address(uint160(uint256(keccak256("hevm cheat code")))));

    QualificationRegistry private qualification;
    MarketRegistry private registry;
    OracleRouter private oracle;
    RiskConfig private risk;
    USDCMarginVault private vault;
    InsuranceFund private insurance;
    PerpEngine private engine;
    MockUSDC private usdc;

    address private constant TRADER = address(0xBEEF);
    address private constant LIQUIDATOR = address(0xCAFE);
    bytes32 private marketId;

    function setUp() public {
        usdc = new MockUSDC();
        qualification = new QualificationRegistry();
        registry = new MarketRegistry(address(qualification));
        oracle = new OracleRouter(120, 8_500);
        // The settlement unit tests use the explicit legacy updater hook. Production
        // configuration remains two independent sources by default.
        oracle.setPolicy(120, 8_500, 1);
        risk = new RiskConfig(address(qualification));
        vault = new USDCMarginVault();
        insurance = new InsuranceFund();
        engine = new PerpEngine(
            address(registry), address(risk), address(oracle), address(vault), address(insurance)
        );

        marketId = registry.registerEvmMarket(8453, address(1), keccak256("TESTNET_CANARY"));
        qualification.approveQualification(
            marketId, bytes32(uint256(1)), keccak256("0.1.0"), 2e18, 1_000_000_000, 100_000_000, 0
        );
        registry.activateMarket(marketId);
        risk.initializeConfig(marketId, 2e18, 1_000_000_000, 100_000_000, 1_000, 500);
        risk.setExposureProvider(address(engine));
        risk.requalifyMarket(marketId, 2e18, 1_000_000_000, 100_000_000, 1_000, 500);

        vault.setCollateralToken(address(usdc));
        vault.setEngine(address(engine));
        insurance.setCollateralToken(address(usdc));
        insurance.setEngine(address(engine));
        engine.setLiquidationKeeper(LIQUIDATOR, true);
        engine.setOrderKeeper(address(this), true);

        oracle.setUpdater(address(this), true);
        oracle.setPrice(marketId, 1e18, uint64(vm.getBlockTimestamp()), 9_500);

        usdc.mint(TRADER, 100_000_000);
        vm.prank(TRADER);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(TRADER);
        vault.deposit(100_000_000);

        usdc.mint(address(this), 1_000_000_000);
        usdc.approve(address(vault), type(uint256).max);
        vault.fundProtocolBacking(500_000_000);
        usdc.approve(address(insurance), type(uint256).max);
        insurance.fund(100_000_000);

        engine.setEconomicConfig(
            // Small bounded development defaults: 10 bps open/close, 20% fee share reserve.
            _fundingConfig(),
            _borrowConfig(),
            PerpEngine.FeeConfig({
                openFeeRateWad: 1e15, closeFeeRateWad: 1e15, insuranceShareBps: 2_000
            }),
            10_000
        );
    }

    function testRealEngineOpenPositionBlocksLpCertificationDespiteFalseZeroRiskBudget() public {
        PublicLPVault lp = new PublicLPVault(address(usdc), 10);
        vault.setLpVault(address(lp));
        lp.setMarginVault(address(vault));
        lp.setSettlementEngine(address(engine));
        lp.setRiskController(address(this));
        address governor = address(0xA11CE);
        lp.setGovernanceExecutor(governor);
        lp.finalizeBootstrap();

        usdc.mint(address(this), 80_000_000);
        usdc.approve(address(lp), 80_000_000);
        vm.prank(governor);
        lp.setPublicLpActive(true);
        lp.deposit(80_000_000);
        lp.setMarketRiskBudget(40_000_000);

        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 20_000_000, 40_000_000);
        require(engine.activePositionCount() == 1, "engine must report the position");
        require(engine.totalOpenNotionalUsdc() == 40_000_000, "engine notional missing");

        // Controller sends a false report that all LP market risk is gone.
        lp.setMarketRiskBudget(0);
        vm.prank(governor);
        lp.setPublicLpActive(false);
        vm.expectRevert();
        lp.certifyWithdrawalAccounting();
        require(!lp.withdrawalAccountingCertified(), "unsettled trader escaped guard");

        vm.prank(TRADER);
        engine.closePosition(positionId);
        require(engine.activePositionCount() == 0, "trader close did not clear count");
        require(engine.totalOpenNotionalUsdc() == 0, "trader close did not clear notional");
        require(vault.totalLockedCollateral() == 0, "margin collateral still locked");
        lp.certifyWithdrawalAccounting();
        require(lp.withdrawalAccountingCertified(), "fully flat engine still blocked");
    }

    function testRealizedProfitWithInsufficientMarginCashBlocksLpCertification() public {
        PublicLPVault lp = new PublicLPVault(address(usdc), 10);
        vault.setLpVault(address(lp));
        lp.setMarginVault(address(vault));
        lp.setSettlementEngine(address(engine));
        lp.setRiskController(address(this));
        address governor = address(0xA11CE);
        lp.setGovernanceExecutor(governor);
        lp.finalizeBootstrap();

        usdc.mint(address(this), 80_000_000);
        usdc.approve(address(lp), 80_000_000);
        vm.prank(governor);
        lp.setPublicLpActive(true);
        lp.deposit(80_000_000);
        lp.setMarketRiskBudget(40_000_000);

        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 20_000_000, 40_000_000);
        oracle.setPrice(marketId, 20e18, uint64(vm.getBlockTimestamp()), 9_500);
        vm.prank(TRADER);
        engine.closePosition(positionId);
        require(engine.activePositionCount() == 0, "position not closed");
        require(engine.totalOpenNotionalUsdc() == 0, "notional not flat");
        require(vault.totalLockedCollateral() == 0, "locked collateral still present");
        require(vault.protocolBadDebt() == 0, "unexpected bad debt");
        require(vault.totalFreeCollateral() > vault.rawCash(), "trader profit fully funded");
        require(!vault.seniorLiabilitiesCovered(), "margin insolvency not detected");

        // Even when the engine is flat, the trader's realized, unpaid profit
        // is senior to LP capital; a risk controller may not certify the exit.
        lp.setMarketRiskBudget(0);
        vm.prank(governor);
        lp.setPublicLpActive(false);
        vm.expectRevert();
        lp.certifyWithdrawalAccounting();
        require(!lp.withdrawalAccountingCertified(), "unfunded gains approved");
    }

    function testDepositOpenCloseAndCustodyMatch() public {
        _assertMatch();
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 20_000_000, 40_000_000);
        require(engine.totalOpenInterest(marketId) == 40_000_000);
        require(engine.settlementSequence() == 1, "open did not advance engine epoch");
        require(engine.activePositionCount() == 1, "active engine position was missed");
        require(engine.totalOpenNotionalUsdc() == 40_000_000, "global OI was missed");

        oracle.setPrice(marketId, 2e18, uint64(vm.getBlockTimestamp()), 9_500);
        uint256 feesBeforeClose = vault.accruedFees();
        uint256 insuranceBeforeClose = vault.insuranceReserve();
        vm.prank(TRADER);
        engine.closePosition(positionId);
        uint256 actualCloseFee = vault.accruedFees() - feesBeforeClose;
        require(actualCloseFee > 0, "close fee was not collected");
        require(
            vault.insuranceReserve() == insuranceBeforeClose + (actualCloseFee * 2_000) / 10_000,
            "close insurance share not based on actual fee"
        );

        require(engine.totalOpenInterest(marketId) == 0);
        require(engine.settlementSequence() == 2, "close did not advance engine epoch");
        require(engine.activePositionCount() == 0, "engine position not cleared");
        require(engine.totalOpenNotionalUsdc() == 0, "global OI not cleared");
        require(vault.lockedCollateral(TRADER) == 0);
        require(vault.freeCollateral(TRADER) > 100_000_000);
        _assertMatch();

        uint256 remaining = vault.freeCollateral(TRADER);
        vm.prank(TRADER);
        vault.withdraw(remaining);
        _assertMatch();
        require(vault.actualCustodyUsdc() == vault.expectedCustodyUsdc());
    }

    function testTwoPhaseOrderExecutionReplayAndCancel() public {
        uint64 expiry = uint64(vm.getBlockTimestamp() + 100);
        vm.prank(TRADER);
        bytes32 orderId = engine.submitOrder(
            marketId, PerpEngine.Action.OPEN, true, 10_000_000, 10_000_000, 2e18, expiry
        );
        uint64 sequence = oracle.latestSequence(marketId);
        engine.executeOrder(orderId, sequence);
        require(engine.activePosition(keccak256(abi.encode(TRADER, marketId))) != 0);
        vm.expectRevert();
        engine.executeOrder(orderId, sequence);

        vm.prank(TRADER);
        bytes32 cancelled =
            engine.submitOrder(marketId, PerpEngine.Action.CLOSE, true, 1, 0, 0.5e18, expiry);
        vm.prank(TRADER);
        engine.cancelOrder(cancelled);
        vm.expectRevert();
        engine.executeOrder(cancelled, sequence);
    }

    function testFundingBorrowSettlementAndEqualTimestamp() public {
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 20_000_000, 40_000_000);
        vm.warp(vm.getBlockTimestamp() + 3_600);
        oracle.setPrice(marketId, 1e18, uint64(vm.getBlockTimestamp()), 9_500);
        // Updating at a later timestamp accrues both indexes.
        vm.prank(TRADER);
        engine.increasePosition(positionId, 1_000_000, 1_000_000);
        (int256 fundingIndex, uint256 borrowIndex,) = engine.marketAccrual(marketId);
        require(fundingIndex > 0);
        require(borrowIndex > 0);

        // A second update in the same timestamp is a valid zero-time update.
        vm.prank(TRADER);
        engine.increasePosition(positionId, 1_000_000, 1_000_000);
        (,, uint64 lastUpdatedAt) = engine.marketAccrual(marketId);
        require(lastUpdatedAt == uint64(vm.getBlockTimestamp()));
    }

    function testPartialReductionSettlesAndPreservesRemainingCollateral() public {
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 20_000_000, 40_000_000);
        oracle.setPrice(marketId, 2e18, uint64(vm.getBlockTimestamp()), 9_500);

        uint256 feesBeforeReduce = vault.accruedFees();
        uint256 insuranceBeforeReduce = vault.insuranceReserve();
        vm.prank(TRADER);
        engine.reducePosition(positionId, 20_000_000, 10_000_000);
        uint256 actualReduceFee = vault.accruedFees() - feesBeforeReduce;
        require(actualReduceFee > 0, "partial-close fee was not collected");
        require(
            vault.insuranceReserve() == insuranceBeforeReduce + (actualReduceFee * 2_000) / 10_000,
            "partial-close insurance share not based on actual fee"
        );

        (address trader, bytes32 id, bool isLong, uint256 collateral, uint256 size,, bool open) =
            engine.positions(positionId);
        require(trader == TRADER && id == marketId && isLong && open);
        require(size == 20_000_000);
        require(collateral == 10_000_000);
        require(engine.totalOpenInterest(marketId) == 20_000_000);
        require(engine.settlementSequence() == 2, "partial reduction epoch missing");
        require(engine.activePositionCount() == 1, "partial reduction closed position");
        require(engine.totalOpenNotionalUsdc() == 20_000_000, "reduced global OI wrong");
        require(vault.lockedCollateral(TRADER) == 10_000_000);
        _assertMatch();

        vm.prank(TRADER);
        engine.reducePosition(positionId, 20_000_000, 10_000_000);
        require(engine.totalOpenInterest(marketId) == 0);
        require(engine.settlementSequence() == 3, "full reduction epoch missing");
        require(engine.activePositionCount() == 0, "full reduction left active position");
        require(engine.totalOpenNotionalUsdc() == 0, "full reduction left global OI");
        require(vault.lockedCollateral(TRADER) == 0);
        _assertMatch();
    }

    function testLiquidationInsuranceAndCustodyMatch() public {
        vm.prank(TRADER);
        uint256 positionId = engine.openPosition(marketId, true, 20_000_000, 40_000_000);
        oracle.setPrice(marketId, 0.1e18, uint64(vm.getBlockTimestamp()), 9_500);
        vm.prank(LIQUIDATOR);
        engine.liquidate(positionId);

        require(engine.totalOpenInterest(marketId) == 0);
        require(insurance.badDebtCovered() > 0);
        require(vault.protocolBadDebt() > 0);
        require(vault.insuranceCoveredBadDebt() == insurance.badDebtCovered());
        _assertMatch();
    }

    function testTransferFailureDoesNotMutateWithdrawalState() public {
        vm.prank(TRADER);
        vault.withdraw(1_000_000);
        uint256 beforeRawCash = vault.rawCash();
        uint256 beforeFree = vault.freeCollateral(TRADER);
        usdc.setFailTransfers(true);
        vm.prank(TRADER);
        vm.expectRevert();
        vault.withdraw(1_000_000);
        require(vault.rawCash() == beforeRawCash);
        require(vault.freeCollateral(TRADER) == beforeFree);
        usdc.setFailTransfers(false);
        _assertMatch();
    }

    function testUnexpectedExternalTransferIsSurplusNotRevenue() public {
        require(usdc.transfer(address(vault), 1_000_000));
        (USDCMarginVault.CustodyStatus status,, uint256 expected, uint256 difference) =
            vault.reconcileCustody();
        require(status == IUSDCMarginVault.CustodyStatus.SURPLUS);
        require(expected == vault.rawCash());
        require(difference == 1_000_000);
    }

    function _assertMatch() private view {
        (USDCMarginVault.CustodyStatus status, uint256 actual, uint256 expected,) =
            vault.reconcileCustody();
        require(status == IUSDCMarginVault.CustodyStatus.MATCH);
        require(actual == expected);
    }

    function _fundingConfig() private pure returns (EconomicModel.FundingConfig memory) {
        return EconomicModel.FundingConfig({
            factorPerSecondWad: 1e12, capPerSecondWad: 1e13, minimumDenominatorUsdWad: 1e18
        });
    }

    function _borrowConfig() private pure returns (EconomicModel.BorrowConfig memory) {
        return EconomicModel.BorrowConfig({
            baseRatePerSecondWad: 1e9,
            slopePerSecondWad: 2e9,
            kinkUtilizationWad: 8e17,
            maxRatePerSecondWad: 2_500_000_000
        });
    }
}
