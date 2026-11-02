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
