// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PublicLPVault } from "../src/PublicLPVault.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { IUSDCMarginVault } from "../src/interfaces/IUSDCMarginVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmLpBridge {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

contract LPMarginBridgeTest {
    VmLpBridge private constant vm =
        VmLpBridge(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant EXECUTOR = address(0xA11CE);
    address private constant TRADER = address(0xBEEF);

    MockUSDC private usdc;
    PublicLPVault private lp;
    USDCMarginVault private margin;
    uint256 public settlementSequence;
    bool public solvencyBlocked;
    bool public lpSettlementMode = true;
    uint256 public pendingOrderCount;

    // Local engine stand-in: tests of trading PnL call margin directly under
    // the test contract's engine authority, and do not model PerpEngine OI.
    function marginVault() external view returns (address) {
        return address(margin);
    }

    function activePositionCount() external pure returns (uint256) {
        return 0;
    }

    function totalOpenNotionalUsdc() external pure returns (uint256) {
        return 0;
    }

    function setUp() public {
        usdc = new MockUSDC();
        margin = new USDCMarginVault();
        lp = new PublicLPVault(address(usdc), 10);
        margin.setCollateralToken(address(usdc));
        margin.setEngine(address(this));
        margin.setLpVault(address(lp));
        lp.setMarginVault(address(margin));
        lp.setSettlementEngine(address(this));
        lp.setRiskController(address(this));
        margin.setGovernanceExecutor(EXECUTOR);
        lp.setGovernanceExecutor(EXECUTOR);
        margin.finalizeBootstrap();
        lp.finalizeBootstrap();
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(true);
        usdc.mint(address(this), 1_000_000);
        usdc.approve(address(lp), type(uint256).max);
        lp.deposit(1_000_000);
        lp.setMarketRiskBudget(500_000);
    }

    function testBackingMovesBetweenOriginalLpAndMarginWithNoDoubleCount() public {
        vm.prank(EXECUTOR);
        lp.allocateToMargin(400_000);
        require(lp.managedAssets() == 600_000, "local custody ledger");
        require(lp.allocatedBacking() == 400_000, "margin principal attribution");
        require(margin.lpBacking() == 400_000, "margin LP attribution");
        require(margin.rawCash() == 400_000, "margin custody ledger");
        require(lp.navAssets() == 1_000_000, "allocation must not mint NAV");
        _assertCustody();

        vm.prank(EXECUTOR);
        lp.recoverFromMargin(250_000);
        require(lp.managedAssets() == 850_000, "recovery local cash");
        require(lp.allocatedBacking() == 150_000, "recovery attributed backing");
        require(margin.lpBacking() == 150_000, "recovery margin ledger");
        require(lp.navAssets() == 1_000_000, "recovery must not mint NAV");
        _assertCustody();
    }

    function testTraderProfitImpairmentCapsLpRecoveryAndExplicitLossWriteDown() public {
        vm.prank(EXECUTOR);
        lp.allocateToMargin(400_000);

        usdc.mint(TRADER, 100_000);
        vm.prank(TRADER);
        usdc.approve(address(margin), type(uint256).max);
        vm.prank(TRADER);
        margin.deposit(100_000);
        margin.lockCollateral(TRADER, 100_000);
        // Realistic vault-side receipt: the trader wins 0.2 USDC.
        margin.settlePositionWad(TRADER, 100_000, int256(200_000 * 1e12), 0);
        require(margin.freeCollateral(TRADER) == 300_000, "senior trader claim");
        require(margin.lpRecoverable() == 200_000, "LP first-loss residual");
        require(lp.navAssets() == 800_000, "LP NAV must reflect trader profit");

        vm.prank(EXECUTOR);
        vm.expectRevert();
        lp.recoverFromMargin(200_001);
        vm.prank(EXECUTOR);
        lp.recoverFromMargin(200_000);
        require(margin.lpRecoverable() == 0, "remaining principal is impaired");
        require(lp.navAssets() == 800_000, "no NAV on recovery");

        // LPs cannot reset the share series while nominal backing remains.
        lp.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.expectRevert();
        lp.claimWithdraw();

        vm.prank(EXECUTOR);
        lp.realizeBackingLoss(200_000);
        require(lp.cumulativeLpBackingLosses() == 200_000, "LP loss not recorded");
        require(margin.cumulativeLpWriteOff() == 200_000, "margin loss not recorded");
        require(lp.allocatedBacking() == 0, "historical backing fully reconciled");
        require(lp.navAssets() == 800_000, "write-off cannot double-charge NAV");
        lp.setMarketRiskBudget(0);
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(false);
        lp.certifyWithdrawalAccounting();
        vm.prank(EXECUTOR);
        lp.setWithdrawalSettlementEnabled(true);
        require(lp.claimWithdraw() == 800_000, "remaining NAV safely redeemed");
        require(lp.totalShares() == 0, "shares consumed");
        _assertCustody();
    }

    function testUnfundedTraderProfitCannotBeReconciledAsSafeLpWithdrawal() public {
        vm.prank(EXECUTOR);
        lp.allocateToMargin(400_000);
        usdc.mint(TRADER, 100_000);
        vm.prank(TRADER);
        usdc.approve(address(margin), type(uint256).max);
        vm.prank(TRADER);
        margin.deposit(100_000);
        margin.lockCollateral(TRADER, 100_000);

        // The test contract is the configured margin engine. Realized gain
        // increases trader cash claims without transferring any additional
        // physical USDC. No open position or pending PnL survives this write.
        margin.settlePosition(TRADER, 100_000, 700_000);
        require(margin.totalLockedCollateral() == 0, "locked collateral unexpectedly remains");
        require(margin.totalFreeCollateral() == 800_000, "senior claim not recorded");
        require(margin.rawCash() == 500_000, "physical cash changed without transfer");
        require(!margin.seniorLiabilitiesCovered(), "unbacked trader profit accepted");

        lp.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(EXECUTOR);
        lp.realizeBackingLoss(400_000);
        lp.setMarketRiskBudget(0);
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(false);

        // The controller knows no open trades and zero risk budget but it
        // cannot issue a settlement certificate while senior cash is short.
        vm.expectRevert();
        lp.certifyWithdrawalAccounting();
        vm.prank(EXECUTOR);
        vm.expectRevert();
        lp.setWithdrawalSettlementEnabled(true);
        vm.expectRevert();
        lp.claimWithdraw();
        require(lp.totalShares() == 1_000_000, "unfair LP share burn");
    }

    function testMarginStateChangeRequiresFreshWithdrawalCertification() public {
        // A flat linked market can certify withdrawal after all LP backing
        // returns, but any later trader-ledger change invalidates that price.
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(false);
        lp.setMarketRiskBudget(0);
        lp.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 10);
        lp.certifyWithdrawalAccounting();
        vm.prank(EXECUTOR);
        lp.setWithdrawalSettlementEnabled(true);
        bytes32 initialDigest = lp.certifiedMarginStateDigest();
        require(initialDigest != bytes32(0), "missing accounting fingerprint");

        usdc.mint(TRADER, 100);
        vm.prank(TRADER);
        usdc.approve(address(margin), type(uint256).max);
        vm.prank(TRADER);
        margin.deposit(100);
        require(margin.settlementStateDigest() != initialDigest, "margin change not detected");
        vm.expectRevert();
        lp.claimWithdraw();
        require(lp.totalShares() == 1_000_000, "stale approval consumed LP shares");

        lp.certifyWithdrawalAccounting();
        require(!lp.withdrawalSettlementEnabled(), "controller reapproved prior governance window");
        require(
            lp.certifiedMarginStateDigest() == margin.settlementStateDigest(), "fresh digest wrong"
        );
        vm.expectRevert();
        lp.claimWithdraw();
        vm.prank(EXECUTOR);
        lp.setWithdrawalSettlementEnabled(true);
        require(lp.claimWithdraw() == 1_000_000, "freshly reconciled exit refused");
        require(lp.totalShares() == 0, "shares not consumed on fresh claim");
    }

    function testTradingEngineSequenceChangeForcesFreshGovernanceApproval() public {
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(false);
        lp.setMarketRiskBudget(0);
        lp.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 10);
        lp.certifyWithdrawalAccounting();
        vm.prank(EXECUTOR);
        lp.setWithdrawalSettlementEnabled(true);

        bytes32 digestBefore = margin.settlementStateDigest();
        uint256 sequenceBefore = lp.certifiedEngineSettlementSequence();
        settlementSequence += 1;
        require(
            margin.settlementStateDigest() == digestBefore, "engine-only mutation altered margin"
        );
        require(settlementSequence != sequenceBefore, "engine epoch did not advance");
        vm.expectRevert();
        lp.claimWithdraw();
        require(lp.totalShares() == 1_000_000, "stale engine epoch burned shares");

        lp.certifyWithdrawalAccounting();
        require(!lp.withdrawalSettlementEnabled(), "controller bypassed governance reapproval");
        vm.expectRevert();
        lp.claimWithdraw();
        vm.prank(EXECUTOR);
        lp.setWithdrawalSettlementEnabled(true);
        require(lp.claimWithdraw() == 1_000_000, "reapproved epoch unable to exit");
    }

    function testTerminalEngineInsolvencyBlocksLpSettlement() public {
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(false);
        lp.setMarketRiskBudget(0);
        solvencyBlocked = true;
        vm.expectRevert();
        lp.certifyWithdrawalAccounting();
        vm.prank(EXECUTOR);
        vm.expectRevert();
        lp.setWithdrawalSettlementEnabled(true);
    }

    function testUnsolicitedMarginDonationDoesNotChangeAccountingFingerprint() public {
        vm.prank(EXECUTOR);
        lp.setPublicLpActive(false);
        lp.setMarketRiskBudget(0);
        lp.certifyWithdrawalAccounting();
        bytes32 beforeDigest = margin.settlementStateDigest();
        usdc.mint(address(margin), 1);
        require(margin.settlementStateDigest() == beforeDigest, "donation changed ledger");
        require(
            lp.certifiedMarginStateDigest() == beforeDigest, "certification unexpectedly changed"
        );
    }

    function testCollectedProtocolFeesCannotInflateLpNav() public {
        vm.prank(EXECUTOR);
        lp.allocateToMargin(400_000);
        usdc.mint(TRADER, 100_000);
        vm.prank(TRADER);
        usdc.approve(address(margin), type(uint256).max);
        vm.prank(TRADER);
        margin.deposit(100_000);

        // Trader collateral turns into a protocol fee, not an LP dividend.
        margin.collectFee(TRADER, 50_000);
        margin.accrueInsuranceReserve(10_000);
        require(margin.accruedFees() == 50_000, "fee was not accrued");
        require(margin.insuranceReserve() == 10_000, "insurance allocation missing");
        require(margin.lpRecoverable() == 400_000, "protocol fee counted as LP equity");
        require(lp.navAssets() == 1_000_000, "LP NAV includes unearned protocol fee");
        _assertCustody();
    }

    function testMissingPhysicalMarginUsdcCannotSupportLpNavOrRecoveries() public {
        vm.prank(EXECUTOR);
        lp.allocateToMargin(400_000);
        require(margin.lpRecoverable() == 400_000, "normal backing not recoverable");
        usdc.burn(address(margin), 1);
        require(margin.lpRecoverable() == 0, "deficient custody was counted");
        require(lp.navAssets() == 600_000, "LP minted against missing cash");
        vm.prank(EXECUTOR);
        vm.expectRevert();
        lp.recoverFromMargin(1);
        require(lp.allocatedBacking() == 400_000, "rejected recovery modified backing");
    }

    function testRiskBudgetAndSurplusDonationBlockAllocation() public {
        vm.prank(EXECUTOR);
        vm.expectRevert();
        lp.allocateToMargin(600_000);
        require(lp.allocatedBacking() == 0, "risk cap was bypassed");
        // Unsolicited tokens at the recipient are never attributed to LP backing.
        usdc.mint(address(margin), 1);
        vm.prank(EXECUTOR);
        vm.expectRevert();
        lp.allocateToMargin(400_000);
        require(lp.managedAssets() == 1_000_000, "reverted transfer mutated ledger");
        require(margin.lpBacking() == 0, "donation was credited as LP capital");
    }

    function _assertCustody() private view {
        (PublicLPVault.CustodyStatus a,,,) = lp.custodyStatus();
        (IUSDCMarginVault.CustodyStatus b,,,) = margin.reconcileCustody();
        require(a == PublicLPVault.CustodyStatus.MATCH, "LP custody mismatch");
        require(b == IUSDCMarginVault.CustodyStatus.MATCH, "margin custody mismatch");
    }
}
