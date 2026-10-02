// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ADLController, IAdlEngine } from "../src/ADLController.sol";
import { PublicLPVault } from "../src/PublicLPVault.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmGate4F1 {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

contract MockAdlEngineF1 is IAdlEngine {
    uint256 public lastPositionId;
    uint256 public lastSize;
    uint256 public lastPrice;
    bool public terminalStateEntered;

    function adlReducePosition(uint256 positionId, uint256 sizeReduced, uint256 executionPrice)
        external
        returns (uint256 economicReduction)
    {
        lastPositionId = positionId;
        lastSize = sizeReduced;
        lastPrice = executionPrice;
        return sizeReduced;
    }

    function enterTerminalInsolvencyState() external {
        terminalStateEntered = true;
    }
}

contract Gate4F1ClosureTest {
    VmGate4F1 private constant vm =
        VmGate4F1(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant EXECUTOR = address(0xE1);
    address private constant EMERGENCY = address(0xE2);
    address private constant KEEPER = address(0xE3);
    address private constant ORACLE = address(0xE4);
    address private constant QUALIFICATION = address(0xE5);
    address private constant LP1 = address(0xE6);
    address private constant LP2 = address(0xE7);

    function testPublicLpActivationIsFailClosedAndEmergencyReversible() public {
        MockUSDC usdc = new MockUSDC();
        PublicLPVault vault = new PublicLPVault(address(usdc), 10);
        _configure(vault);

        usdc.mint(address(vault), 1_000_000);
        vm.prank(EXECUTOR);
        vm.expectRevert();
        vault.setPublicLpActive(true);

        vault.recordManagedAssets(1_000_000);
        MockUSDC badDebtUsdc = new MockUSDC();
        PublicLPVault badDebtVault = new PublicLPVault(address(badDebtUsdc), 10);
        _configure(badDebtVault);
        badDebtUsdc.mint(address(badDebtVault), 1_000_000);
        badDebtVault.recordManagedAssets(1_000_000);
        badDebtVault.recordBadDebt(1);
        vm.prank(EXECUTOR);
        vm.expectRevert();
        badDebtVault.setPublicLpActive(true);

        MockUSDC liabilityUsdc = new MockUSDC();
        PublicLPVault liabilityVault = new PublicLPVault(address(liabilityUsdc), 10);
        _configure(liabilityVault);
        liabilityVault.recordTraderLiability(1);
        vm.prank(EXECUTOR);
        vm.expectRevert();
        liabilityVault.setPublicLpActive(true);

        vm.prank(EMERGENCY);
        vm.expectRevert();
        vault.setPublicLpActive(true);
        vm.prank(ORACLE);
        vm.expectRevert();
        vault.setPublicLpActive(true);
        vm.prank(QUALIFICATION);
        vm.expectRevert();
        vault.setPublicLpActive(true);
        vm.prank(KEEPER);
        vm.expectRevert();
        vault.setPublicLpActive(true);

        vm.prank(EXECUTOR);
        vault.setPublicLpActive(true);
        vm.prank(EXECUTOR);
        vm.expectRevert();
        vault.setPublicLpActive(true);

        vm.prank(EMERGENCY);
        vault.emergencyPausePublicLp();
        require(!vault.publicLpActive(), "emergency pause failed");
        vm.prank(EMERGENCY);
        vm.expectRevert();
        vault.setPublicLpActive(true);

        vm.prank(EXECUTOR);
        vault.setPublicLpActive(true);
        require(vault.publicLpActive(), "governance reactivation failed");
    }

    function testPublicLpActiveLifecycleReconcilesNAVSharesAndWithdrawals() public {
        MockUSDC usdc = new MockUSDC();
        PublicLPVault vault = new PublicLPVault(address(usdc), 10);
        _configure(vault);
        vault.recordManagedAssets(0);

        usdc.mint(LP1, 1_000_000);
        usdc.mint(LP2, 1_000_000);
        vm.prank(EXECUTOR);
        vault.setPublicLpActive(true);

        vm.prank(LP1);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(LP1);
        vault.deposit(1_000_000);
        vm.prank(LP2);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(LP2);
        vault.deposit(1_000_000);
        require(vault.totalShares() == 2_000_000, "share mint");

        // Engine/controller settlement updates the canonical liability before
        // withdrawal pricing; this is the active public-LP integration hook.
        vault.recordTraderLiability(400_000);
        vault.accountInsurance(100_000);
        vault.recordBadDebt(50_000);
        require(vault.navAssets() == 1_450_000, "liability-adjusted NAV");

        vm.prank(LP1);
        vault.requestWithdraw(500_000);
        vm.prank(EMERGENCY);
        vault.emergencyPausePublicLp();
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP1);
        uint256 firstClaim = vault.claimWithdraw();
        require(firstClaim == 362_500, "first LP claim");
        require(vault.totalShares() == 1_500_000, "share burn");

        vm.prank(LP2);
        vault.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP2);
        vault.claimWithdraw();
        (PublicLPVault.CustodyStatus status,,,) = vault.custodyStatus();
        require(status == PublicLPVault.CustodyStatus.MATCH, "LP custody mismatch");
        require(vault.totalShares() == 500_000, "remaining shares");
    }

    function testADL100AccountsIsBoundedAndUnresolvedStateIsExplicit() public {
        MockAdlEngineF1 engine = new MockAdlEngineF1();
        ADLController controller = new ADLController(address(engine));
        controller.setKeeper(KEEPER);
        bytes32 episode = keccak256("adl-100");
        controller.openEpisode(episode, 100);
        vm.expectRevert();
        controller.openEpisode(episode, 100);
        for (uint256 index = 1; index <= 100; index++) {
            controller.registerCandidate(episode, index, 1, 10_000 - index);
        }
        for (uint256 index = 1; index <= 100; index++) {
            vm.prank(KEEPER);
            controller.execute(episode, index, 1, 2e18);
        }
        require(controller.remainingDeficit(episode) == 0, "ADL did not progress");
        vm.prank(KEEPER);
        controller.finalize(episode);
        require(controller.episodeFinalized(episode), "ADL not finalized");

        bytes32 unresolved = keccak256("adl-unresolved");
        controller.openEpisode(unresolved, 10);
        controller.registerCandidate(unresolved, 1_001, 1, 1);
        vm.expectRevert();
        controller.registerCandidate(unresolved, 1_000, 1, 1);
        vm.prank(KEEPER);
        controller.execute(unresolved, 1_001, 1, 2e18);
        require(controller.remainingDeficit(unresolved) == 9, "deficit accounting");
        vm.prank(KEEPER);
        controller.finalizeUnresolved(unresolved);
        require(engine.terminalStateEntered(), "terminal state not entered");
        require(controller.remainingDeficit(unresolved) == 9, "unresolved debt erased");
        vm.expectRevert();
        controller.registerCandidate(unresolved, 1_002, 1, 1);
        vm.prank(KEEPER);
        vm.expectRevert();
        controller.execute(unresolved, 1_001, 1, 2e18);
    }

    function testCompatibilityLossSettlementDoesNotDoubleCreditFreeCollateral() public {
        USDCMarginVault vault = new USDCMarginVault();
        vault.setEngine(address(this));
        vault.creditCollateral(address(this), 100);
        vault.lockCollateral(address(this), 100);
        vault.settlePosition(address(this), 100, -10);
        require(vault.freeCollateral(address(this)) == 90, "trader balance");
        require(vault.totalFreeCollateral() == 90, "global balance");
    }

    function testAdlResolutionConsumesOnlyRecordedUncoveredDebt() public {
        USDCMarginVault vault = new USDCMarginVault();
        vault.setEngine(address(this));
        vault.creditCollateral(address(this), 100);
        vault.lockCollateral(address(this), 100);
        vault.settlePosition(address(this), 100, -150);
        require(vault.protocolBadDebt() == 50, "bad debt setup");
        require(vault.pendingNegativePnl() == 50, "negative claim setup");

        vault.applyADLResolution(20);
        require(vault.protocolBadDebt() == 30, "remaining bad debt");
        require(vault.pendingNegativePnl() == 30, "remaining negative claim");
        require(vault.adlCoveredBadDebt() == 20, "ADL accounting");

        vm.expectRevert();
        vault.applyADLResolution(31);
    }

    function _configure(PublicLPVault vault) private {
        vault.setGovernanceExecutor(EXECUTOR);
        vault.setRiskController(address(this));
        vault.setRole(vault.EMERGENCY_ADMIN_ROLE(), EMERGENCY, true);
        vault.setRole(vault.KEEPER_ROLE(), KEEPER, true);
        vault.setRole(vault.ORACLE_ADMIN_ROLE(), ORACLE, true);
        vault.setRole(vault.QUALIFICATION_WRITER_ROLE(), QUALIFICATION, true);
        vault.finalizeBootstrap();
    }
}
