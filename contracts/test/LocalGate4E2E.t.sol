// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EconomicModel } from "../src/EconomicModel.sol";
import { IERC20 } from "../src/IERC20.sol";
import { InsuranceFund } from "../src/InsuranceFund.sol";
import { IOracleRouter } from "../src/interfaces/IOracleRouter.sol";
import { IUSDCMarginVault } from "../src/interfaces/IUSDCMarginVault.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { OracleRouter } from "../src/OracleRouter.sol";
import { PerpEngine } from "../src/PerpEngine.sol";
import { QualificationRegistry } from "../src/QualificationRegistry.sol";
import { RiskConfig } from "../src/RiskConfig.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";

/**
 * Reproducible Arc-Anvil end-to-end test.
 *
 * Run against the Arc local runtime, not generic Anvil:
 *
 *   arc-forge test --fork-url http://127.0.0.1:8546 --match-contract LocalGate4E2ETest -vvv
 *
 * Reporter keys are read only from LOCAL_REPORTER_{1,2,3}_KEY when supplied. The test has
 * deterministic local-only fallbacks so it remains offline and never embeds private keys.
 */
interface VmLocalGate4 {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256 value);
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
}

contract LocalGate4E2ETest {
    VmLocalGate4 private constant vm =
        VmLocalGate4(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant USDC = 0x3600000000000000000000000000000000000000;
    uint256 private constant WAD = 1e18;
    uint256 private constant MILLION = 1_000_000;

    address private constant ADMIN = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address private constant KEEPER = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
    address private constant TRADER_LONG = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;
    address private constant TRADER_SHORT = 0x976EA74026E726554dB657fA54763abd0C3a0aa9;
    address private constant LIQUIDATOR = 0x14DC79964BdD9B7f5DdeaEd2C7b2D1a0e2D2F3F4;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant REPORT_TYPEHASH = keccak256(
        "CompositePriceReport(uint256 arcChainId,address oracleRouter,bytes32 marketId,uint256 midPriceWad,uint256 minPriceWad,uint256 maxPriceWad,uint256 confidenceBps,uint256 sourceCount,uint256 independentSourceCount,uint256 observedAt,uint256 validFrom,uint256 expiresAt,uint256 sequence,bytes32 evidenceRoot,bytes32 reporterSetVersion)"
    );

    QualificationRegistry private qualification;
    MarketRegistry private registry;
    OracleRouter private oracle;
    RiskConfig private risk;
    USDCMarginVault private vault;
    InsuranceFund private insurance;
    PerpEngine private engine;
    IERC20 private usdc;

    bytes32 private marketId;
    bytes32 private reporterVersion;
    uint256 private reporter1Key;
    uint256 private reporter2Key;
    uint256 private reporter3Key;
    address private reporter1;
    address private reporter2;
    address private reporter3;
    uint64 private lastSequence;

    function testFullLocalMultiAccountE2E() public {
        // Generic offline Forge has no Arc USDC predeploy. The dedicated Arc Anvil
        // command below is the required execution path for this test.
        if (USDC.code.length == 0) return;
        require(block.chainid == 31_337, "must run on Arc Anvil");
        _deployAndConfigure();
        _runLongAndShortCanaries();
        _runLiquidationAndBadDebtCanaries();
        _runMarketStateAndRequalificationCanary();
        _runOrderAndOracleReplayCanaries();
        _withdrawAndReconcile();
    }

    function _deployAndConfigure() private {
        usdc = IERC20(USDC);
        reporter1Key = vm.envOr("LOCAL_REPORTER_1_KEY", uint256(keccak256("local-reporter-1")));
        reporter2Key = vm.envOr("LOCAL_REPORTER_2_KEY", uint256(keccak256("local-reporter-2")));
        reporter3Key = vm.envOr("LOCAL_REPORTER_3_KEY", uint256(keccak256("local-reporter-3")));
        reporter1 = vm.addr(reporter1Key);
        reporter2 = vm.addr(reporter2Key);
        reporter3 = vm.addr(reporter3Key);

        qualification = new QualificationRegistry();
        registry = new MarketRegistry(address(qualification));
        oracle = new OracleRouter(120, 8_500);
        risk = new RiskConfig(address(qualification));
        vault = new USDCMarginVault();
        insurance = new InsuranceFund();
        engine = new PerpEngine(
            address(registry), address(risk), address(oracle), address(vault), address(insurance)
        );

        // Foundry contract creation is owned by this harness; explicitly hand every
        // deployment role to the local Anvil admin before configuration begins.
        qualification.transferOwnership(ADMIN);
        registry.transferOwnership(ADMIN);
        oracle.transferOwnership(ADMIN);
        risk.transferOwnership(ADMIN);
        vault.transferOwnership(ADMIN);
        insurance.transferOwnership(ADMIN);
        engine.transferOwnership(ADMIN);

        vm.startPrank(ADMIN);
        marketId = registry.registerEvmMarket(8453, address(1), keccak256("TESTNET_CANARY"));
        qualification.approveQualification(
            marketId,
            keccak256("local-qualification-v1"),
            keccak256("0.1.0"),
            2e18,
            100_000_000,
            50_000_000,
            0
        );
        registry.activateMarket(marketId);
        risk.initializeConfig(marketId, 2e18, 100_000_000, 50_000_000, 1_000, 500);
        risk.setExposureProvider(address(engine));
        risk.requalifyMarket(marketId, 2e18, 100_000_000, 50_000_000, 1_000, 500);
        vault.setCollateralToken(address(usdc));
        vault.setEngine(address(engine));
        insurance.setCollateralToken(address(usdc));
        insurance.setEngine(address(engine));
        engine.setLiquidationKeeper(LIQUIDATOR, true);
        engine.setOrderKeeper(KEEPER, true);
        engine.setMarketSideCaps(marketId, 50_000_000, 50_000_000);
        engine.setSkewConfig(WAD, 1e15);
        engine.setEconomicConfig(
            _fundingConfig(),
            _borrowConfig(),
            PerpEngine.FeeConfig({
                openFeeRateWad: 1e15, closeFeeRateWad: 1e15, insuranceShareBps: 2_000
            }),
            10_000
        );
        oracle.setReporter(reporter1, true);
        oracle.setReporter(reporter2, true);
        oracle.setReporter(reporter3, true);
        reporterVersion = keccak256("local-reporters-v1");
        oracle.setReporterThreshold(2, reporterVersion);
        oracle.setPolicy(120, 8_500, 2);

        usdc.approve(address(vault), type(uint256).max);
        vault.fundProtocolBacking(500_000_000);
        usdc.approve(address(insurance), type(uint256).max);
        insurance.fund(100_000_000);
        vm.stopPrank();

        _deposit(TRADER_LONG, 100_000_000);
        _deposit(TRADER_SHORT, 100_000_000);
        _acceptReport(1, WAD, 999e15, 1_001e15);
    }

    function _runLongAndShortCanaries() private {
        uint256 longPosition = _submitAndExecuteOpen(TRADER_LONG, true, 20_000_000, 40_000_000);
        require(engine.totalOpenInterest(marketId) == 40_000_000, "long OI");
        require(engine.longOpenInterest(marketId) == 40_000_000, "long side OI");

        vm.warp(vm.getBlockTimestamp() + 3_600);
        _acceptReport(2, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_LONG);
        engine.increasePosition(longPosition, 1_000_000, 1_000_000);
        (int256 fundingIndex, uint256 borrowIndex,) = engine.marketAccrual(marketId);
        require(fundingIndex != 0, "funding not accrued");
        require(borrowIndex != 0, "borrow not accrued");

        uint256 longFreeBefore = vault.freeCollateral(TRADER_LONG);
        _acceptReport(3, 1_500e15, 1_499e15, 1_501e15);
        vm.prank(TRADER_LONG);
        engine.closePosition(longPosition);
        require(engine.totalOpenInterest(marketId) == 0, "long close OI");
        require(vault.freeCollateral(TRADER_LONG) > longFreeBefore, "long PnL");

        uint256 shortPosition = _submitAndExecuteOpen(TRADER_SHORT, false, 20_000_000, 40_000_000);
        require(engine.shortOpenInterest(marketId) == 40_000_000, "short side OI");
        _acceptReport(4, 500e15, 499e15, 501e15);
        uint256 shortFreeBefore = vault.freeCollateral(TRADER_SHORT);
        vm.prank(TRADER_SHORT);
        engine.closePosition(shortPosition);
        require(engine.totalOpenInterest(marketId) == 0, "short close OI");
        require(vault.freeCollateral(TRADER_SHORT) > shortFreeBefore, "short PnL");
        _assertVaultMatch();
    }

    function _runLiquidationAndBadDebtCanaries() private {
        _acceptReport(5, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_LONG);
        uint256 residualPosition = engine.openPosition(marketId, true, 4_000_000, 8_000_000);
        _acceptReport(6, 600e15, 599e15, 601e15);
        uint256 liquidatorBefore = vault.freeCollateral(LIQUIDATOR);
        vm.prank(LIQUIDATOR);
        engine.liquidate(residualPosition);
        require(vault.freeCollateral(LIQUIDATOR) > liquidatorBefore, "liquidator reward");
        require(engine.totalOpenInterest(marketId) == 0, "residual liquidation OI");

        _acceptReport(7, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_LONG);
        uint256 badDebtPosition = engine.openPosition(marketId, true, 2_000_000, 4_000_000);
        _acceptReport(8, 100e15, 99e15, 101e15);
        vm.prank(LIQUIDATOR);
        engine.liquidate(badDebtPosition);
        require(engine.totalOpenInterest(marketId) == 0, "bad debt liquidation OI");
        require(vault.protocolBadDebt() > 0, "bad debt missing");
        require(vault.insuranceCoveredBadDebt() > 0, "insurance not applied");
        require(insurance.badDebtCovered() == vault.insuranceCoveredBadDebt(), "insurance parity");
        require(insurance.uncoveredBadDebt() == 0, "unexpected uncovered debt");
        _assertVaultMatch();
        require(insurance.actualCustodyUsdc() == insurance.availableCapital(), "insurance custody");
    }

    function _runMarketStateAndRequalificationCanary() private {
        _acceptReport(9, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_SHORT);
        uint256 emergencyPosition = engine.openPosition(marketId, false, 2_000_000, 2_000_000);

        vm.startPrank(ADMIN);
        risk.emergencyReduceRiskLimits(marketId, 1e18, 2_000_000, 2_000_000, 1_000, 500);
        engine.setMarketSideCaps(marketId, 2_000_000, 2_000_000);
        risk.emergencySetStatus(marketId, RiskConfig.MarketStatus.PAUSED);
        registry.setState(marketId, MarketRegistry.MarketState.PAUSED);
        vm.stopPrank();

        vm.prank(TRADER_LONG);
        vm.expectRevert();
        engine.openPosition(marketId, true, 1_000_000, 1_000_000);
        vm.prank(TRADER_SHORT);
        vm.expectRevert();
        engine.increasePosition(emergencyPosition, 1_000_000, 1_000_000);

        _acceptReport(10, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_SHORT);
        engine.reducePosition(emergencyPosition, 1_000_000, 1_000_000);

        vm.startPrank(ADMIN);
        risk.emergencySetStatus(marketId, RiskConfig.MarketStatus.CLOSE_ONLY);
        registry.setState(marketId, MarketRegistry.MarketState.CLOSE_ONLY);
        vm.stopPrank();
        _acceptReport(11, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_SHORT);
        engine.closePosition(emergencyPosition);
        require(engine.totalOpenInterest(marketId) == 0, "close-only close");

        vm.warp(vm.getBlockTimestamp() + 1);
        vm.startPrank(ADMIN);
        qualification.approveQualification(
            marketId,
            keccak256("local-qualification-v2"),
            keccak256("0.1.0"),
            2e18,
            10_000_000,
            5_000_000,
            0
        );
        risk.requalifyMarket(marketId, 2e18, 10_000_000, 5_000_000, 1_000, 500);
        registry.activateMarket(marketId);
        engine.setMarketSideCaps(marketId, 5_000_000, 5_000_000);
        vm.stopPrank();
        require(risk.getConfig(marketId).maxOI == 10_000_000, "requalification limits");
    }

    function _runOrderAndOracleReplayCanaries() private {
        _runOrderReplayCanary();
        _runOracleSignatureAttackCanary();
        _runExpiredReportCanary();
    }

    function _runOrderReplayCanary() private {
        _acceptReport(12, WAD, 999e15, 1_001e15);
        uint64 expiry = uint64(vm.getBlockTimestamp() + 100);
        vm.prank(TRADER_LONG);
        bytes32 cancelled = engine.submitOrder(
            marketId, PerpEngine.Action.OPEN, true, 2_000_000, 2_000_000, 2e18, expiry
        );
        vm.prank(TRADER_LONG);
        engine.cancelOrder(cancelled);
        vm.expectRevert();
        vm.prank(KEEPER);
        engine.executeOrder(cancelled, lastSequence);

        vm.prank(TRADER_SHORT);
        bytes32 consumed = engine.submitOrder(
            marketId, PerpEngine.Action.OPEN, false, 2_000_000, 2_000_000, 2e18, expiry
        );
        vm.prank(KEEPER);
        engine.executeOrder(consumed, lastSequence);
        vm.expectRevert();
        vm.prank(KEEPER);
        engine.executeOrder(consumed, lastSequence);

        uint256 active = engine.activePosition(keccak256(abi.encode(TRADER_SHORT, marketId)));
        _acceptReport(13, WAD, 999e15, 1_001e15);
        vm.prank(TRADER_SHORT);
        engine.closePosition(active);
    }

    function _runOracleSignatureAttackCanary() private {
        IOracleRouter.OracleReport memory base = _makeReport(
            lastSequence + 1,
            WAD,
            999e15,
            1_001e15,
            uint64(vm.getBlockTimestamp()),
            uint64(vm.getBlockTimestamp()),
            uint64(vm.getBlockTimestamp() + 100)
        );
        bytes[] memory validSignatures = _sign(base, reporter1Key, reporter2Key);
        _runInvalidSignatureCases(base, validSignatures);

        IOracleRouter.OracleReport memory future = base;
        future.observedAt = uint64(vm.getBlockTimestamp() + 1);
        future.validFrom = future.observedAt;
        future.expiresAt = future.observedAt + 100;
        bytes[] memory futureSignatures = _sign(future, reporter1Key, reporter2Key);
        vm.expectRevert();
        oracle.setSignedReport(future, futureSignatures);
    }

    function _runInvalidSignatureCases(
        IOracleRouter.OracleReport memory base,
        bytes[] memory validSignatures
    ) private {
        bytes[] memory duplicateSignatures = new bytes[](2);
        duplicateSignatures[0] = validSignatures[0];
        duplicateSignatures[1] = validSignatures[0];
        vm.expectRevert();
        oracle.setSignedReport(base, duplicateSignatures);

        bytes[] memory oneSignature = new bytes[](1);
        oneSignature[0] = validSignatures[0];
        vm.expectRevert();
        oracle.setSignedReport(base, oneSignature);

        IOracleRouter.OracleReport memory wrongMarket = base;
        wrongMarket.marketId = keccak256("wrong-market");
        vm.expectRevert();
        oracle.setSignedReport(wrongMarket, validSignatures);

        IOracleRouter.OracleReport memory wrongChain = base;
        wrongChain.arcChainId = block.chainid + 1;
        vm.expectRevert();
        oracle.setSignedReport(wrongChain, validSignatures);

        IOracleRouter.OracleReport memory tamperedPrice = base;
        tamperedPrice.midPrice = 2e18;
        vm.expectRevert();
        oracle.setSignedReport(tamperedPrice, validSignatures);

        IOracleRouter.OracleReport memory tamperedEvidence = base;
        tamperedEvidence.evidenceRoot = keccak256("tampered");
        vm.expectRevert();
        oracle.setSignedReport(tamperedEvidence, validSignatures);
    }

    function _runExpiredReportCanary() private {
        uint64 nextSequence = lastSequence + 1;
        uint64 expiry = uint64(vm.getBlockTimestamp() + 100);
        IOracleRouter.OracleReport memory expired = _makeReport(
            nextSequence,
            WAD,
            999e15,
            1_001e15,
            uint64(vm.getBlockTimestamp() - 100),
            uint64(vm.getBlockTimestamp() - 100),
            uint64(vm.getBlockTimestamp() - 1)
        );
        bytes[] memory expiredSignatures = _sign(expired, reporter1Key, reporter2Key);
        oracle.setSignedReport(expired, expiredSignatures);
        require(!oracle.isReportUsable(marketId), "expired report usable");

        vm.prank(TRADER_LONG);
        bytes32 staleOrder = engine.submitOrder(
            marketId, PerpEngine.Action.OPEN, true, 1_000_000, 1_000_000, 2e18, expiry
        );
        vm.expectRevert();
        vm.prank(KEEPER);
        engine.executeOrder(staleOrder, expired.sequence);
        vm.prank(TRADER_LONG);
        engine.cancelOrder(staleOrder);

        _acceptReport(nextSequence + 1, WAD, 999e15, 1_001e15);
        vm.expectRevert();
        oracle.setSignedReport(expired, expiredSignatures);
        require(oracle.latestSequence(marketId) == nextSequence + 1, "sequence replay");
    }

    function _withdrawAndReconcile() private {
        require(engine.totalOpenInterest(marketId) == 0, "final OI");
        _withdrawAllFree(TRADER_LONG);
        _withdrawAllFree(TRADER_SHORT);
        _withdrawAllFree(LIQUIDATOR);
        _assertVaultMatch();
        require(insurance.actualCustodyUsdc() == insurance.availableCapital(), "insurance final");
        require(vault.protocolBadDebt() == vault.insuranceCoveredBadDebt(), "bad debt final");
    }

    function _withdrawAllFree(address trader) private {
        uint256 amount = vault.freeCollateral(trader);
        if (amount == 0) return;
        vm.prank(trader);
        vault.withdraw(amount);
    }

    function _deposit(address trader, uint256 amount) private {
        vm.prank(trader);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(trader);
        vault.deposit(amount);
    }

    function _submitAndExecuteOpen(address trader, bool isLong, uint256 collateral, uint256 size)
        private
        returns (uint256 positionId)
    {
        uint64 expiry = uint64(vm.getBlockTimestamp() + 100);
        vm.prank(trader);
        bytes32 orderId = engine.submitOrder(
            marketId, PerpEngine.Action.OPEN, isLong, size, collateral, 2e18, expiry
        );
        vm.prank(KEEPER);
        engine.executeOrder(orderId, lastSequence);
        positionId = engine.activePosition(keccak256(abi.encode(trader, marketId)));
        require(positionId != 0, "position missing");
    }

    function _acceptReport(uint64 sequence, uint256 mid, uint256 minPrice, uint256 maxPrice)
        private
    {
        uint64 current = uint64(vm.getBlockTimestamp());
        IOracleRouter.OracleReport memory report =
            _makeReport(sequence, mid, minPrice, maxPrice, current, current, current + 100);
        bytes[] memory signatures = _sign(report, reporter1Key, reporter2Key);
        vm.prank(KEEPER);
        oracle.setSignedReport(report, signatures);
        lastSequence = sequence;
    }

    function _makeReport(
        uint64 sequence,
        uint256 mid,
        uint256 minPrice,
        uint256 maxPrice,
        uint64 observedAt,
        uint64 validFrom,
        uint64 expiresAt
    ) private view returns (IOracleRouter.OracleReport memory report) {
        report = IOracleRouter.OracleReport({
            marketId: marketId,
            arcChainId: block.chainid,
            midPrice: mid,
            minPrice: minPrice,
            maxPrice: maxPrice,
            confidenceBps: 9_500,
            sourceCount: 3,
            independentSourceCount: 3,
            observedAt: observedAt,
            validFrom: validFrom,
            expiresAt: expiresAt,
            sequence: sequence,
            evidenceRoot: keccak256(abi.encode("local-evidence", sequence, mid)),
            reporterSetVersion: reporterVersion
        });
    }

    function _sign(IOracleRouter.OracleReport memory report, uint256 key1, uint256 key2)
        private
        returns (bytes[] memory signatures)
    {
        bytes32 digest = _digest(report);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(key1, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(key2, digest);
        signatures = new bytes[](2);
        signatures[0] = abi.encodePacked(r1, s1, v1);
        signatures[1] = abi.encodePacked(r2, s2, v2);
    }

    function _digest(IOracleRouter.OracleReport memory report) private view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("ArcMemePerps Oracle")),
                keccak256(bytes("1")),
                block.chainid,
                address(oracle)
            )
        );
        // All fields in the typed struct occupy one ABI word. Splitting the packed
        // representation keeps the local E2E harness below the Solidity stack limit
        // while remaining byte-for-byte equivalent to abi.encode(...).
        bytes memory prefix = abi.encodePacked(
            REPORT_TYPEHASH,
            bytes32(report.arcChainId),
            bytes32(uint256(uint160(address(oracle)))),
            report.marketId,
            bytes32(report.midPrice),
            bytes32(report.minPrice),
            bytes32(report.maxPrice),
            bytes32(report.confidenceBps),
            bytes32(report.sourceCount),
            bytes32(report.independentSourceCount)
        );
        bytes memory suffix = abi.encodePacked(
            bytes32(uint256(report.observedAt)),
            bytes32(uint256(report.validFrom)),
            bytes32(uint256(report.expiresAt)),
            bytes32(uint256(report.sequence)),
            report.evidenceRoot,
            report.reporterSetVersion
        );
        bytes32 structHash = keccak256(bytes.concat(prefix, suffix));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _assertVaultMatch() private view {
        (IUSDCMarginVault.CustodyStatus status, uint256 actual, uint256 expected,) =
            vault.reconcileCustody();
        require(status == IUSDCMarginVault.CustodyStatus.MATCH, "custody status");
        require(actual == expected, "custody mismatch");
    }

    function _fundingConfig() private pure returns (EconomicModel.FundingConfig memory) {
        return EconomicModel.FundingConfig({
            factorPerSecondWad: 1e12, capPerSecondWad: 1e13, minimumDenominatorUsdWad: WAD
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
