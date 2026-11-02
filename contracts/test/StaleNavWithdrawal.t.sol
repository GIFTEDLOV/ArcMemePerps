// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PublicLPVault } from "../src/PublicLPVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmStaleNav {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

/// @notice Security regression: an already matured request must not redeem
/// against stale controller-pushed NAV while LP capital is exposed to traders.
contract StaleNavWithdrawalTest {
    VmStaleNav private constant vm =
        VmStaleNav(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant GOVERNANCE = address(0xA11CE);
    address private constant LP_A = address(0xA);
    address private constant LP_B = address(0xB);

    MockUSDC private usdc;
    PublicLPVault private vault;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new PublicLPVault(address(usdc), 10);
        vault.setRiskController(address(this));
        vault.setGovernanceExecutor(GOVERNANCE);
        vault.finalizeBootstrap();
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(true);

        usdc.mint(LP_A, 1_000_000);
        usdc.mint(LP_B, 1_000_000);
        vm.prank(LP_A);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(LP_B);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(LP_A);
        vault.deposit(1_000_000);
        vm.prank(LP_B);
        vault.deposit(1_000_000);
    }

    function testOldAccountingCertificationCannotSurviveDepositReactivation() public {
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        require(vault.withdrawalAccountingCertified(), "initial certification missing");

        // Even a zero-risk deposit phase changes the liability/accounting epoch.
        // Governance must not reuse an earlier approval after that phase.
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(true);
        require(!vault.withdrawalAccountingCertified(), "reused stale certificate");

        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vm.prank(GOVERNANCE);
        vm.expectRevert();
        vault.setWithdrawalSettlementEnabled(true);

        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        require(vault.withdrawalSettlementEnabled(), "fresh approval rejected");
    }

    function testEmergencyGuardianCanCloseActiveSettlement() public {
        // The deployment bootstrap owner grants this capability to a guardian.
        address guardian = address(0xC);
        // The vault is already finalized, so a governance executor assigns it.
        vm.prank(GOVERNANCE);
        vault.setRole(vault.EMERGENCY_ADMIN_ROLE(), guardian, true);
        vm.prank(LP_A);
        vault.requestWithdraw(500_000);

        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        vm.prank(guardian);
        vault.emergencyPauseWithdrawalSettlement();

        require(!vault.withdrawalSettlementEnabled(), "guardian failed to stop claims");
        require(!vault.withdrawalAccountingCertified(), "guardian left stale certification");
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();
    }

    function testUnsolicitedSurplusCannotFreezeCertifiedWithdrawals() public {
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        // Any external account can donate/dust the ERC20 vault. The extra
        // balance must not enter NAV or deny all legitimate LP claims.
        usdc.mint(address(vault), 1);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        require(vault.claimWithdraw() == 1_000_000, "donation moved LP share value");
        require(vault.navAssets() == 1_000_000, "surplus incorrectly counted in NAV");
        require(usdc.balanceOf(address(vault)) == 1_000_001, "surplus disappeared");
    }

    function testSurplusArrivingAfterCertificationDoesNotFreezeClaims() public {
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        usdc.mint(address(vault), 1);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        require(vault.claimWithdraw() == 1_000_000, "dust blocked settlement");
    }

    function testPhysicalCustodyDeficitBlocksApprovedWithdrawal() public {
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        // A deficit after controller certification must invalidate payout
        // even when some physical USDC remains to pay the first LP.
        usdc.burn(address(vault), 1);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();
        require(vault.totalShares() == 2_000_000, "shares burned under deficit");
        require(usdc.balanceOf(LP_A) == 0, "cash escaped under custody deficit");
    }

    function testDepositsCannotUseStaleNavWhileRiskIsOpen() public {
        vault.setMarketRiskBudget(500_000);
        usdc.mint(LP_A, 100_000);
        vm.prank(LP_A);
        vm.expectRevert();
        vault.deposit(100_000);
        require(vault.totalShares() == 2_000_000, "stale-price share mint");
    }

    function testClaimsRequireSeparateControllerCertificationAndGovernance() public {
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vm.prank(GOVERNANCE);
        vm.expectRevert();
        vault.setWithdrawalSettlementEnabled(true);

        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        require(vault.withdrawalSettlementEnabled(), "settlement not open");

        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        require(vault.claimWithdraw() == 1_000_000, "wrong LP payout");
        require(vault.totalShares() == 1_000_000, "wrong remaining shares");
    }

    function testLateLiabilityUpdateClosesSettlementUntilReconciledAgain() public {
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        vm.warp(vm.getBlockTimestamp() + 10);

        vault.recordTraderLiability(500_000);
        require(!vault.withdrawalSettlementEnabled(), "stale certification survived");
        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();

        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        vm.prank(LP_A);
        require(vault.claimWithdraw() == 750_000, "repriced LP NAV is wrong");
        require(vault.navAssets() == 750_000, "remaining LP NAV is wrong");
    }

    function testBadDebtCanBePricedAfterQuiescentReconciliation() public {
        vault.recordBadDebt(400_000);
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        require(vault.claimWithdraw() == 800_000, "known bad debt omitted");
        require(vault.navAssets() == 800_000, "remaining LP overcharged");
    }

    function testExpiredQueueMustRenewCooldownBeforeClaim() public {
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 1 days + 11);
        vm.prank(GOVERNANCE);
        vault.setPublicLpActive(false);
        vault.certifyWithdrawalAccounting();
        vm.prank(GOVERNANCE);
        vault.setWithdrawalSettlementEnabled(true);

        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();
        vm.prank(LP_A);
        vault.renewWithdrawalRequest();
        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.prank(LP_A);
        require(vault.claimWithdraw() == 1_000_000, "renewal failed");
    }

    function testMaturedWithdrawalCannotExitAgainstUnreportedTraderLoss() public {
        // LP risk budget is outstanding, but an external keeper has not yet
        // published the trader's 1 USDC positive PnL liability.
        vault.setMarketRiskBudget(1_000_000);
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 10);

        // On the unpatched vault this succeeds, transferring 1 USDC to LP_A.
        // A later recordTraderLiability(1_000_000) then leaves LP_B with zero NAV.
        // Hardened behavior must fail closed while LP risk remains outstanding.
        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();
        require(usdc.balanceOf(LP_A) == 0, "premature LP payout");
        require(vault.totalShares() == 2_000_000, "unfair share burn");
    }

    function testMaturedWithdrawalCannotExitAheadOfBadDebtWrite() public {
        vault.setMarketRiskBudget(1_000_000);
        vm.prank(LP_A);
        vault.requestWithdraw(1_000_000);
        vm.warp(vm.getBlockTimestamp() + 100);

        // Long-overdue withdrawal requests must not be usable as standing
        // options over future bad-debt reporting / reconciliation.
        vm.prank(LP_A);
        vm.expectRevert();
        vault.claimWithdraw();
        require(vault.navAssets() == 2_000_000, "unexpected NAV mutation");
    }
}
