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

    function setUp() public {
        usdc = new MockUSDC();
        margin = new USDCMarginVault();
        lp = new PublicLPVault(address(usdc), 10);
        margin.setCollateralToken(address(usdc));
        margin.setEngine(address(this));
        margin.setLpVault(address(lp));
        lp.setMarginVault(address(margin));
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
        require(lp.claimWithdraw() == 800_000, "remaining NAV safely redeemed");
        require(lp.totalShares() == 0, "shares consumed");
        _assertCustody();
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
