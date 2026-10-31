// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PublicLPVault } from "../src/PublicLPVault.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { MockUSDC } from "./MockUSDC.sol";
import { ProtocolTimelock } from "../src/ProtocolTimelock.sol";

interface Vm {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

contract RevertingMarginVault {
    function rawCash() external pure returns (uint256) {
        revert("RAW_CASH_FAILED");
    }
    function traderLiabilities() external pure returns (uint256) {
        revert("TRADER_LIABILITIES_FAILED");
    }
    function cumulativeUncoveredBadDebt() external pure returns (uint256) {
        revert("UNCOVERED_BAD_DEBT_FAILED");
    }
}

contract ProductionPublicLPVaultTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC internal usdc;
    PublicLPVault internal lpVault;
    USDCMarginVault internal marginVault;

    address internal constant OWNER = address(0xAA);
    address internal constant EXECUTOR = address(0xBB);
    address internal constant CONTROLLER = address(0xCC);
    address internal constant EMERGENCY = address(0xDD);
    address internal constant LP1 = address(0x11);
    address internal constant LP2 = address(0x22);

    function setUp() public {
        usdc = new MockUSDC();

        // 1. Deploy LP vault
        lpVault = new PublicLPVault(address(usdc), 86400); // 1-day cooldown

        // 2. Deploy Margin vault
        marginVault = new USDCMarginVault();
        marginVault.setCollateralToken(address(usdc));

        // 3. Configure LP vault
        lpVault.setRiskController(CONTROLLER);
        lpVault.setAuthorizedMarginVault(address(marginVault));
        marginVault.setLiquidityPool(address(lpVault));
        lpVault.setRole(lpVault.EMERGENCY_ADMIN_ROLE(), EMERGENCY, true);

        // 4. Finalize bootstrap
        lpVault.setGovernanceExecutor(EXECUTOR);
        marginVault.setGovernanceExecutor(EXECUTOR);
        lpVault.finalizeBootstrap();
        marginVault.finalizeBootstrap();

        // 5. Activate LP vault via executor
        vm.prank(EXECUTOR);
        lpVault.setPublicLpActive(true);

        // 6. Fund users
        usdc.mint(LP1, 100_000_000_000); // 100k USDC
        usdc.mint(LP2, 100_000_000_000);

        vm.prank(LP1);
        usdc.approve(address(lpVault), type(uint256).max);

        vm.prank(LP2);
        usdc.approve(address(lpVault), type(uint256).max);
    }

    function testDonationInflationImmunity() public {
        // LP1 deposits 10,000 USDC
        vm.prank(LP1);
        uint256 shares = lpVault.deposit(10_000_000_000);
        require(shares == 10_000_000_000, "initial shares mismatch");

        // Attacker donates 50,000 USDC directly to the LP vault contract
        usdc.mint(address(lpVault), 50_000_000_000);

        // navAssets() must NOT be inflated by unsolicited transfer
        require(lpVault.navAssets() == 10_000_000_000, "NAV inflated by donation");
        require(lpVault.sharePriceWad() == 1e18, "share price manipulated");

        // Custody status reports surplus
        (PublicLPVault.CustodyStatus status,,, uint256 surplus) = lpVault.custodyStatus();
        require(status == PublicLPVault.CustodyStatus.SURPLUS, "expected surplus");
        require(surplus == 50_000_000_000, "surplus amount mismatch");

        // LP2 deposits at fair 1:1 price
        vm.prank(LP2);
        uint256 lp2Shares = lpVault.deposit(5_000_000_000);
        require(lp2Shares == 5_000_000_000, "LP2 unfair share calculation");
    }

    function testMaxPoolCapRejection() public {
        // Set cap to 5,000 USDC
        vm.prank(EXECUTOR);
        lpVault.setMaxPoolCap(5_000_000_000);

        // Deposit 5,001 USDC -> should revert
        vm.prank(LP1);
        vm.expectRevert();
        lpVault.deposit(5_000_000_001);

        // Deposit 5,000 USDC -> should succeed
        vm.prank(LP1);
        lpVault.deposit(5_000_000_000);
        require(lpVault.managedAssets() == 5_000_000_000, "deposit within cap failed");
    }

    function testCapitalAllocationToMarginVault() public {
        // LP1 deposits 10,000 USDC
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);

        // Controller allocates 7,000 USDC (70% <= 80% max) to USDCMarginVault
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(7_000_000_000);

        require(lpVault.allocatedCapital() == 7_000_000_000, "allocated capital mismatch");
        require(lpVault.liquidCustodyUsdc() == 3_000_000_000, "liquid custody mismatch");
        require(marginVault.protocolBacking() == 7_000_000_000, "margin backing mismatch");
        require(marginVault.rawCash() == 7_000_000_000, "rawCash mismatch");
        require(marginVault.withdrawableLiquidity() == 7_000_000_000, "withdrawable mismatch");

        // Check custody status on both sides
        (PublicLPVault.CustodyStatus status,,, uint256 diff) = lpVault.custodyStatus();
        require(status == PublicLPVault.CustodyStatus.MATCH, "custody mismatch after allocation");
        require(diff == 0, "diff non zero");

        // Exceeding allocation ratio (>80%) must revert
        vm.prank(CONTROLLER);
        vm.expectRevert();
        lpVault.allocateToMarginVault(2_000_000_000); // 7k + 2k = 9k > 8k
    }

    function testCapitalReturnFromMarginVault() public {
        // Deposit and allocate 5,000 USDC
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(5_000_000_000);

        // Return 2,000 USDC back to LP vault
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(2_000_000_000);

        require(lpVault.allocatedCapital() == 3_000_000_000, "allocated remaining mismatch");
        require(lpVault.liquidCustodyUsdc() == 7_000_000_000, "liquid remaining mismatch");
        require(marginVault.protocolBacking() == 3_000_000_000, "margin backing mismatch");
        require(marginVault.withdrawableLiquidity() == 3_000_000_000, "withdrawable mismatch");
    }

    function testQueuedWithdrawalWithLiquidityReservation() public {
        // Deposit 10,000 USDC
        vm.prank(LP1);
        uint256 shares = lpVault.deposit(10_000_000_000);

        // Allocate 9,000 USDC when ratio is set to 90%
        vm.prank(EXECUTOR);
        lpVault.setMaxAllocationRatioBps(9000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(9_000_000_000);

        // Request withdraw of all shares
        vm.prank(LP1);
        lpVault.requestWithdraw(shares);

        // Cooldown active check
        vm.prank(LP1);
        vm.expectRevert();
        lpVault.claimWithdraw();

        // Warp past cooldown
        vm.warp(vm.getBlockTimestamp() + 86401);

        // Cannot claim all 10,000 USDC because only 1,000 is liquid!
        vm.prank(LP1);
        vm.expectRevert();
        lpVault.claimWithdraw();

        // Return 9,000 USDC from margin vault
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(9_000_000_000);

        // Now claim withdraw succeeds completely
        uint256 lp1BalBefore = usdc.balanceOf(LP1);
        vm.prank(LP1);
        uint256 withdrawn = lpVault.claimWithdraw();

        require(withdrawn == 10_000_000_000, "withdrawn amount mismatch");
        require(usdc.balanceOf(LP1) - lp1BalBefore == withdrawn, "balance transfer mismatch");
    }

    function testFeeRevenueIncreasesShareValue() public {
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);

        uint256 initialPrice = lpVault.sharePriceWad();

        // Fee recording without actual physical custody in vault reverts
        vm.prank(CONTROLLER);
        vm.expectRevert();
        lpVault.recordFeeRevenue(500_000_000);

        // Physical custody received from protocol trading fees
        usdc.mint(address(lpVault), 500_000_000);

        // 500 USDC in trading fees accrued and recorded
        vm.prank(CONTROLLER);
        lpVault.recordFeeRevenue(500_000_000);

        uint256 newPrice = lpVault.sharePriceWad();
        require(newPrice > initialPrice, "share price did not increase");

        // LP2 deposits at new higher share price
        vm.prank(LP2);
        uint256 lp2Shares = lpVault.deposit(10_500_000_000);

        // LP2 should get fewer shares than initial 1:1
        require(lp2Shares < 10_500_000_000, "LP2 did not pay fair share price");
    }

    function testEmergencyPauseBlocksDepositsOnly() public {
        vm.prank(LP1);
        uint256 shares = lpVault.deposit(5_000_000_000);

        // Request withdrawal
        vm.prank(LP1);
        lpVault.requestWithdraw(shares);

        // Trigger emergency pause
        vm.prank(EMERGENCY);
        lpVault.emergencyPausePublicLp();

        // New deposits blocked
        vm.prank(LP2);
        vm.expectRevert();
        lpVault.deposit(1_000_000_000);

        // Withdrawal claim still functions past cooldown
        vm.warp(vm.getBlockTimestamp() + 86401);
        vm.prank(LP1);
        uint256 withdrawn = lpVault.claimWithdraw();
        require(withdrawn > 0, "withdrawal claim blocked");
    }

    function testDepositsAndWithdrawalsInSameBlock() public {
        vm.prank(LP1);
        uint256 shares = lpVault.deposit(5_000_000_000);

        // Immediate request
        vm.prank(LP1);
        lpVault.requestWithdraw(shares);

        // Immediate claim in the same block MUST revert due to cooldown
        vm.prank(LP1);
        vm.expectRevert();
        lpVault.claimWithdraw();
    }

    function testZeroShareMintingAndZeroNavDepositRevert() public {
        PublicLPVault standaloneLp = new PublicLPVault(address(usdc), 86400);
        standaloneLp.setRiskController(CONTROLLER);
        standaloneLp.setGovernanceExecutor(EXECUTOR);
        standaloneLp.finalizeBootstrap();
        vm.prank(EXECUTOR);
        standaloneLp.setPublicLpActive(true);

        vm.prank(LP1);
        usdc.approve(address(standaloneLp), type(uint256).max);
        vm.prank(LP2);
        usdc.approve(address(standaloneLp), type(uint256).max);

        // Zero assets deposit must revert
        vm.prank(LP1);
        vm.expectRevert();
        standaloneLp.deposit(0);

        // Initial deposit
        vm.prank(LP1);
        standaloneLp.deposit(1_000_000_000);

        // Bad debt completely wiping out NAV
        vm.prank(CONTROLLER);
        standaloneLp.recordBadDebt(1_000_000_000);
        require(standaloneLp.navAssets() == 0, "NAV should be 0");

        // Subsequent deposit into 0-NAV pool with existing shares must revert
        vm.prank(LP2);
        vm.expectRevert();
        standaloneLp.deposit(1_000_000_000);
    }

    function testUnauthorizedCallsRevert() public {
        address attacker = address(0x666);

        vm.prank(attacker);
        vm.expectRevert();
        lpVault.allocateToMarginVault(1_000_000_000);

        vm.prank(attacker);
        vm.expectRevert();
        lpVault.returnFromMarginVault(1_000_000_000);

        vm.prank(attacker);
        vm.expectRevert();
        lpVault.recordFeeRevenue(1_000_000_000);

        vm.prank(attacker);
        vm.expectRevert();
        lpVault.setMaxPoolCap(100);

        vm.prank(attacker);
        vm.expectRevert();
        lpVault.setAuthorizedMarginVault(address(marginVault));

        vm.prank(attacker);
        vm.expectRevert();
        lpVault.setPublicLpActive(false);
    }

    function testInsuranceFundExhaustionAndBadDebtAbsorbedByNAV() public {
        PublicLPVault standaloneLp = new PublicLPVault(address(usdc), 86400);
        standaloneLp.setRiskController(CONTROLLER);
        standaloneLp.setGovernanceExecutor(EXECUTOR);
        standaloneLp.finalizeBootstrap();
        vm.prank(EXECUTOR);
        standaloneLp.setPublicLpActive(true);

        vm.prank(LP1);
        usdc.approve(address(standaloneLp), type(uint256).max);

        vm.prank(LP1);
        standaloneLp.deposit(10_000_000_000); // 10k USDC
        require(standaloneLp.sharePriceWad() == 1e18, "initial price mismatch");

        // 2,000 USDC in uncovered bad debt (after insurance fund exhausted)
        vm.prank(CONTROLLER);
        standaloneLp.recordBadDebt(2_000_000_000);

        // NAV drops to 8k
        require(standaloneLp.navAssets() == 8_000_000_000, "NAV did not drop by bad debt");
        require(standaloneLp.sharePriceWad() == 0.8e18, "share price did not drop to 0.8");

        // LP1 exits absorbing the loss
        vm.prank(LP1);
        standaloneLp.requestWithdraw(10_000_000_000);

        vm.warp(vm.getBlockTimestamp() + 86401);
        uint256 lp1BalBefore = usdc.balanceOf(LP1);

        vm.prank(LP1);
        uint256 payout = standaloneLp.claimWithdraw();

        require(payout == 8_000_000_000, "payout did not reflect loss");
        require(usdc.balanceOf(LP1) - lp1BalBefore == 8_000_000_000, "received amount mismatch");
    }

    function testManyProfitableTradersWithdrawSimultaneously() public {
        // 1. LP supplies protocol backing
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000); // 20k USDC
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000); // 15k protocol backing

        address traderA = address(0xA1);
        address traderB = address(0xB1);
        address traderC = address(0xC1);

        usdc.mint(traderA, 10_000_000_000);
        usdc.mint(traderB, 10_000_000_000);
        usdc.mint(traderC, 10_000_000_000);

        vm.prank(traderA);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(traderB);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(traderC);
        usdc.approve(address(marginVault), type(uint256).max);

        // 2. Traders deposit margin collateral
        vm.prank(traderA);
        marginVault.deposit(5_000_000_000);
        vm.prank(traderB);
        marginVault.deposit(3_000_000_000);
        vm.prank(traderC);
        marginVault.deposit(2_000_000_000);

        require(marginVault.rawCash() == 25_000_000_000, "marginVault rawCash mismatch");
        require(marginVault.totalFreeCollateral() == 10_000_000_000, "total free collateral mismatch");
        require(marginVault.protocolBacking() == 15_000_000_000, "protocol backing mismatch");

        // 3. Traders withdraw simultaneously
        vm.prank(traderA);
        marginVault.withdraw(5_000_000_000);
        vm.prank(traderB);
        marginVault.withdraw(3_000_000_000);
        vm.prank(traderC);
        marginVault.withdraw(2_000_000_000);

        require(marginVault.rawCash() == 15_000_000_000, "marginVault rawCash not equal to backing");
        require(marginVault.totalFreeCollateral() == 0, "free collateral not zero");

        // 4. LP recalls full backing
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(15_000_000_000);
        require(marginVault.rawCash() == 0, "marginVault not drained cleanly");
        require(lpVault.liquidCustodyUsdc() == 20_000_000_000, "LP vault didn't recover all capital");
    }

    function testIdempotentBadDebtReconciliation() public {
        PublicLPVault standaloneLp = new PublicLPVault(address(usdc), 86400);
        standaloneLp.setRiskController(CONTROLLER);
        standaloneLp.setGovernanceExecutor(EXECUTOR);
        standaloneLp.finalizeBootstrap();
        vm.prank(EXECUTOR);
        standaloneLp.setPublicLpActive(true);

        vm.prank(LP1);
        usdc.approve(address(standaloneLp), type(uint256).max);

        vm.prank(LP1);
        standaloneLp.deposit(10_000_000_000); // 10k USDC

        // 1. First report of 1,000 USDC bad debt in standalone mode
        vm.prank(CONTROLLER);
        standaloneLp.recordBadDebt(1_000_000_000);
        require(standaloneLp.cumulativeBadDebt() == 1_000_000_000, "initial bad debt mismatch");
        require(standaloneLp.navAssets() == 9_000_000_000, "NAV did not drop by 1k");

        // 2. Duplicate retry with same 1,000 USDC bad debt does NOT double deduct
        vm.prank(CONTROLLER);
        standaloneLp.recordBadDebt(1_000_000_000);
        require(standaloneLp.cumulativeBadDebt() == 1_000_000_000, "bad debt double counted on retry");
        require(standaloneLp.navAssets() == 9_000_000_000, "NAV dropped on duplicate report");

        // 3. Stale/lower report (e.g. 500 USDC) is ignored
        vm.prank(CONTROLLER);
        standaloneLp.recordBadDebt(500_000_000);
        require(standaloneLp.cumulativeBadDebt() == 1_000_000_000, "bad debt decremented by stale report");

        // 4. Higher authoritative report increments cleanly
        vm.prank(CONTROLLER);
        standaloneLp.recordBadDebt(1_500_000_000);
        require(standaloneLp.cumulativeBadDebt() == 1_500_000_000, "higher report not accepted");
        require(standaloneLp.navAssets() == 8_500_000_000, "NAV mismatch after update");
    }

    function testTraderWithdrawsAllFreeCollateralWithoutProtocolBacking() public {
        address trader = address(0x777);
        usdc.mint(trader, 5_000_000_000);

        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);

        // Trader deposits 5k into empty margin vault (zero protocol backing)
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);

        require(marginVault.rawCash() == 5_000_000_000, "rawCash mismatch");
        require(marginVault.protocolBacking() == 0, "protocolBacking should be 0");
        require(marginVault.totalFreeCollateral() == 5_000_000_000, "freeCollateral mismatch");

        // Trader withdraws all 5k free collateral -> MUST succeed safely
        vm.prank(trader);
        marginVault.withdraw(5_000_000_000);

        require(marginVault.rawCash() == 0, "rawCash not zero");
        require(marginVault.totalFreeCollateral() == 0, "freeCollateral not zero");
        require(usdc.balanceOf(trader) == 5_000_000_000, "trader did not receive funds");
    }

    function testTraderPartialWithdrawalPreservesLPBackingAndOtherTraders() public {
        // 1. LP provides 15k backing (deposits 20k, allocates 15k <= 80%)
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        // 2. Trader 1 and Trader 2 deposit 5k each
        address t1 = address(0x881);
        address t2 = address(0x882);
        usdc.mint(t1, 5_000_000_000);
        usdc.mint(t2, 5_000_000_000);

        vm.prank(t1);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(t2);
        usdc.approve(address(marginVault), type(uint256).max);

        vm.prank(t1);
        marginVault.deposit(5_000_000_000);
        vm.prank(t2);
        marginVault.deposit(5_000_000_000);

        require(marginVault.rawCash() == 25_000_000_000, "rawCash mismatch");
        require(marginVault.protocolBacking() == 15_000_000_000, "backing mismatch");
        require(marginVault.withdrawableLiquidity() == 15_000_000_000, "withdrawable mismatch");

        // 3. Trader 1 withdraws 2.5k
        vm.prank(t1);
        marginVault.withdraw(2_500_000_000);

        // Verification of invariants:
        // - rawCash decremented by 2.5k
        require(marginVault.rawCash() == 22_500_000_000, "rawCash after withdrawal mismatch");
        // - Trader 2's 5k free collateral is 100% intact
        require(marginVault.freeCollateral(t2) == 5_000_000_000, "t2 collateral impaired");
        // - LP's protocol backing is 100% intact
        require(marginVault.protocolBacking() == 15_000_000_000, "protocolBacking impaired");
        // - LP recall capacity is UNCHANGED at 15k
        require(marginVault.withdrawableLiquidity() == 15_000_000_000, "LP recall capacity reduced");
    }

    function testWithdrawalBlockedWhenCollateralLockedOrPositivePnlPending() public {
        address trader = address(0x999);
        usdc.mint(trader, 10_000_000_000);

        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(10_000_000_000);

        // Trader locks 6k collateral (set engine via EXECUTOR)
        vm.prank(EXECUTOR);
        marginVault.setEngine(address(this));
        marginVault.lockCollateral(trader, 6_000_000_000);

        // Free collateral is now 4k
        require(marginVault.freeCollateral(trader) == 4_000_000_000, "free collateral mismatch");

        // Attempting to withdraw 4,001 reverts with InsufficientFreeCollateral
        vm.prank(trader);
        vm.expectRevert();
        marginVault.withdraw(4_000_000_001);

        // Engine sets pending positive PnL of 3k owed to other traders
        marginVault.setPendingPositivePnl(3_000_000_000);

        // Now withdrawableCollateral is 10k rawCash - (6k locked + 3k pnl) = 1k!
        require(marginVault.withdrawableCollateral() == 1_000_000_000, "withdrawableCollateral mismatch");

        // Trader tries to withdraw 2k (has 4k free, but only 1k is unreserved) -> REVERTS!
        vm.prank(trader);
        vm.expectRevert();
        marginVault.withdraw(2_000_000_000);

        // Trader can withdraw up to 1k safely
        vm.prank(trader);
        marginVault.withdraw(1_000_000_000);
        require(marginVault.rawCash() == 9_000_000_000, "rawCash after safe withdraw mismatch");
    }

    function testWithdrawalRunExhaustsLiquidityAndQueues() public {
        vm.prank(LP1);
        uint256 s1 = lpVault.deposit(10_000_000_000);
        vm.prank(LP2);
        uint256 s2 = lpVault.deposit(10_000_000_000);

        // Allocate 16k (80%) to MarginVault, leaving 4k liquid in LPVault
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(16_000_000_000);

        // Both request withdrawal of 10k
        vm.prank(LP1);
        lpVault.requestWithdraw(s1);
        vm.prank(LP2);
        lpVault.requestWithdraw(s2);

        vm.warp(vm.getBlockTimestamp() + 86401);

        // LP1 attempts to claim 10k but only 4k is liquid -> reverts!
        vm.prank(LP1);
        vm.expectRevert();
        lpVault.claimWithdraw();

        // Return 16k from MarginVault
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(16_000_000_000);

        // Now both can claim cleanly
        vm.prank(LP1);
        lpVault.claimWithdraw();
        vm.prank(LP2);
        lpVault.claimWithdraw();

        require(lpVault.totalShares() == 0, "shares remain");
        require(lpVault.managedAssets() == 0, "managed assets remain");
    }

    function testTokenTransferFailureRevertsCleanly() public {
        vm.prank(LP1);
        uint256 shares = lpVault.deposit(5_000_000_000);

        vm.prank(LP1);
        lpVault.requestWithdraw(shares);
        vm.warp(vm.getBlockTimestamp() + 86401);

        // Token transfer fails (e.g. paused token, blocklist, out of gas)
        usdc.setFailTransfers(true);

        vm.prank(LP1);
        vm.expectRevert();
        lpVault.claimWithdraw();

        // State was NOT corrupted by the failed call
        require(lpVault.shareBalance(LP1) == shares, "shares burned prematurely");
        require(lpVault.totalShares() == shares, "total shares decremented");

        // Restore transfers and claim succeeds
        usdc.setFailTransfers(false);
        vm.prank(LP1);
        uint256 withdrawn = lpVault.claimWithdraw();
        require(withdrawn == 5_000_000_000, "withdrawn mismatch");
    }

    function testFeeRecordingZeroAndNonZeroAllocatedCapital() public {
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000); // 10k USDC

        // 1. Fee recording with ZERO allocated capital
        usdc.mint(address(lpVault), 1_000_000_000); // 1k fee transferred
        vm.prank(CONTROLLER);
        lpVault.recordFeeRevenue(1_000_000_000);
        require(lpVault.managedAssets() == 11_000_000_000, "managed assets mismatch (0 alloc)");
        require(lpVault.navAssets() == 11_000_000_000, "NAV mismatch (0 alloc)");
        require(lpVault.sharePriceWad() == 1.1e18, "share price mismatch (0 alloc)");

        // 2. Allocate capital to margin vault
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(5_000_000_000); // 5k allocated
        require(lpVault.allocatedCapital() == 5_000_000_000, "allocated capital mismatch");
        require(lpVault.navAssets() == 11_000_000_000, "NAV should not change on allocation");

        // 3. Fee recording with NON-ZERO allocated capital
        usdc.mint(address(lpVault), 1_000_000_000); // another 1k fee
        vm.prank(CONTROLLER);
        lpVault.recordFeeRevenue(1_000_000_000);
        require(lpVault.managedAssets() == 12_000_000_000, "managed assets mismatch (nonzero alloc)");
        require(lpVault.navAssets() == 12_000_000_000, "NAV mismatch (nonzero alloc)");
        require(lpVault.sharePriceWad() == 1.2e18, "share price mismatch (nonzero alloc)");
    }

    function testFeeRecordingMissingInsufficientAndDuplicateReverts() public {
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);

        // A. Missing transfer: record fee without tokens arriving -> REVERTS
        vm.prank(CONTROLLER);
        vm.expectRevert();
        lpVault.recordFeeRevenue(500_000_000);

        // B. Insufficient transfer: send 200, record 500 -> REVERTS
        usdc.mint(address(lpVault), 200_000_000);
        vm.prank(CONTROLLER);
        vm.expectRevert();
        lpVault.recordFeeRevenue(500_000_000);

        // C. Exact transfer: send another 300 (total surplus 500) -> SUCCEEDS
        usdc.mint(address(lpVault), 300_000_000);
        vm.prank(CONTROLLER);
        lpVault.recordFeeRevenue(500_000_000);
        require(lpVault.managedAssets() == 10_500_000_000, "fee record failed");

        // D. Duplicate call: immediately repeat recordFeeRevenue(500) -> REVERTS
        vm.prank(CONTROLLER);
        vm.expectRevert();
        lpVault.recordFeeRevenue(500_000_000);
    }

    function testAtomicDepositFeeRevenue() public {
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);

        address feePayer = address(0xFAFA);
        usdc.mint(feePayer, 1_000_000_000);

        vm.prank(feePayer);
        usdc.approve(address(lpVault), type(uint256).max);

        // Atomic deposit pulls tokens and credits NAV in single transaction
        vm.prank(feePayer);
        lpVault.depositFeeRevenue(1_000_000_000);

        require(lpVault.managedAssets() == 11_000_000_000, "managedAssets mismatch");
        require(lpVault.navAssets() == 11_000_000_000, "navAssets mismatch");
        require(lpVault.sharePriceWad() == 1.1e18, "share price mismatch");
    }

    function testMarginVaultTransferFeesToLP() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        address trader = address(0x777);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);

        vm.prank(trader);
        marginVault.deposit(5_000_000_000);

        // Engine collects 500 fee from trader free collateral
        vm.prank(engine);
        marginVault.collectFee(trader, 500_000_000);
        require(marginVault.accruedFees() == 500_000_000, "accruedFees mismatch");

        // Liquidity pool recalls accrued fee from margin vault (atomically updates LP vault)
        uint256 lpBalBefore = usdc.balanceOf(address(lpVault));
        vm.prank(address(lpVault));
        marginVault.transferFeesToLP(500_000_000);

        require(usdc.balanceOf(address(lpVault)) - lpBalBefore == 500_000_000, "fee transfer failed");
        require(marginVault.accruedFees() == 0, "accruedFees not decremented");
        require(lpVault.managedAssets() == 500_000_000, "atomic fee recording failed");

        // Duplicate recording call immediately reverts
        vm.prank(CONTROLLER);
        vm.expectRevert();
        lpVault.recordFeeRevenue(500_000_000);
    }

    function testTemporaryIlliquidityDoesNotDepressSharePrice() public {
        // LP deposits 20k (5k local, 15k allocated to margin vault)
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        require(lpVault.navAssets() == 20_000_000_000, "initial NAV mismatch");
        require(lpVault.sharePriceWad() == 1.0e18, "initial price mismatch");

        // Trader deposits 10k and locks all 10k in active trade
        address trader = address(0x444);
        usdc.mint(trader, 10_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(10_000_000_000);

        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        vm.prank(engine);
        marginVault.lockCollateral(trader, 10_000_000_000);

        // Immediate withdrawable liquidity in margin vault drops because collateral is locked
        require(marginVault.withdrawableLiquidity() == 15_000_000_000, "withdrawable liquidity mismatch");

        // CRITICAL CHECK: Temporary illiquidity DOES NOT depress LP NAV or share price!
        require(lpVault.navAssets() == 20_000_000_000, "NAV depressed by locked collateral!");
        require(lpVault.sharePriceWad() == 1.0e18, "Share price crashed without loss!");

        // Now trader earns +5k profit (pending positive PnL)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(5_000_000_000);

        // Realized/unrealized profit owed to traders DOES reduce LP NAV to 15k
        require(lpVault.navAssets() == 15_000_000_000, "NAV did not recognize trader profit");
        require(lpVault.sharePriceWad() == 0.75e18, "Share price did not drop to 0.75");

        // Trader closes position at break-even (PnL cleared to 0, collateral unlocked)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0);
        vm.prank(engine);
        marginVault.unlockCollateral(trader, 10_000_000_000);

        // LP NAV returns to full 20k and share price returns to 1.0
        require(lpVault.navAssets() == 20_000_000_000, "NAV did not restore after trade close");
        require(lpVault.sharePriceWad() == 1.0e18, "Share price did not restore");
    }

    function testBadDebtFullRecoveryToZero() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 10k, allocates 8k
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(8_000_000_000);

        // Trader deposits 2k and liquidates with 3k bad debt
        address trader = address(0x555);
        usdc.mint(trader, 2_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(2_000_000_000);

        vm.prank(engine);
        marginVault.lockCollateral(trader, 2_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(trader, 2_000_000_000, -5_000_000_000);

        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "uncovered bad debt mismatch");
        require(lpVault.navAssets() == 7_000_000_000, "NAV did not drop by bad debt");

        // Insurance covers FULL 3k bad debt
        usdc.mint(address(marginVault), 3_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(3_000_000_000);

        // On-chain uncovered bad debt is now EXACTLY 0
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "uncovered bad debt not zero");

        // Reconcile bad debt in LP vault
        lpVault.reconcileBadDebt();
        require(lpVault.cumulativeBadDebt() == 0, "LP vault cumulativeBadDebt not reset to 0");

        // NAV returns to full 100% fair value (10k)
        require(lpVault.navAssets() == 10_000_000_000, "NAV did not fully recover to 10k");
        require(lpVault.sharePriceWad() == 1.0e18, "Share price did not recover to 1.0");
    }

    function testLPNavReflectsRecoverableAssetsWhenImpaired() public {
        // LP deposits 20k
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);

        // Allocate 15k to margin vault
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);
        require(lpVault.navAssets() == 20_000_000_000, "initial NAV mismatch");

        // Trader deposits 5k collateral
        address trader = address(0x888);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);

        // Engine sets pending positive PnL = 10k owed to traders
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);
        vm.prank(engine);
        marginVault.setPendingPositivePnl(10_000_000_000);

        // Margin vault: rawCash = 20k (15k LP + 5k trader).
        // Trader liabilities = 5k free + 10k pending PnL = 15k.
        // withdrawableLiquidity = 20k - 15k = 5k.
        // Recoverable LP capital is MIN(15k, 5k) = 5k.
        // LP vault local cash = 5k.
        // Total recoverable LP NAV = 5k local + 5k recoverable = 10k!
        require(lpVault.navAssets() == 10_000_000_000, "NAV did not drop to recoverable claim");
        require(lpVault.sharePriceWad() == 0.5e18, "share price did not drop to 0.5");

        // LP requests 10,000,000,000 shares (50% of shares, worth 5k USDC at 0.5 price)
        vm.prank(LP1);
        lpVault.requestWithdraw(10_000_000_000);
        vm.warp(vm.getBlockTimestamp() + 86401);

        // Claiming gives 5k (fair 0.5 price), protecting winning traders
        vm.prank(LP1);
        uint256 payout = lpVault.claimWithdraw();
        require(payout == 5_000_000_000, "liquid payout mismatch");
    }

    function testBadDebtReconciliationIdempotencyAndInsuranceRecovery() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 10k
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);

        // Allocate 8k to margin vault
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(8_000_000_000);

        // Trader position liquidated creating 3k bad debt
        address trader = address(0x999);
        usdc.mint(trader, 2_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(2_000_000_000);

        vm.prank(engine);
        marginVault.lockCollateral(trader, 2_000_000_000);

        // Settle with -5k loss -> 3k bad debt
        vm.prank(engine);
        marginVault.settlePosition(trader, 2_000_000_000, -5_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "uncovered bad debt mismatch");

        // LP NAV drops from 10k to 7k
        require(lpVault.navAssets() == 7_000_000_000, "NAV mismatch after bad debt");

        // Idempotent reconciliation: calling recordBadDebt repeatedly leaves state intact
        vm.prank(CONTROLLER);
        lpVault.recordBadDebt(3_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.recordBadDebt(3_000_000_000);
        require(lpVault.cumulativeBadDebt() == 3_000_000_000, "bad debt corrupted by idempotent calls");
        require(lpVault.navAssets() == 7_000_000_000, "NAV corrupted by idempotent calls");

        // Now Insurance fund covers 2k of the bad debt
        usdc.mint(address(marginVault), 2_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(2_000_000_000);

        require(marginVault.cumulativeUncoveredBadDebt() == 1_000_000_000, "uncovered debt after insurance mismatch");

        // LP NAV immediately recovers 2k to 9k!
        require(lpVault.navAssets() == 9_000_000_000, "NAV did not recover after insurance payment");

        // Reconcile again: updates to 1k
        vm.prank(CONTROLLER);
        lpVault.recordBadDebt(1_000_000_000);
        require(lpVault.cumulativeBadDebt() == 1_000_000_000, "reconciliation after insurance failed");
    }

    // 1. Regression test: Full insurance recovery restores NAV immediately without reconcileBadDebt()
    function testImmediateInsuranceRecoveryWithoutReconcile() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 20k, allocates 15k
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        require(lpVault.navAssets() == 20_000_000_000, "initial NAV mismatch");

        // Trader deposits 5k, liquidates causing 4k bad debt
        address trader = address(0x666);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);

        vm.prank(engine);
        marginVault.lockCollateral(trader, 5_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(trader, 5_000_000_000, -9_000_000_000); // 5k - 9k = 4k bad debt

        require(marginVault.cumulativeUncoveredBadDebt() == 4_000_000_000, "bad debt mismatch");
        // LP NAV drops from 20k to 16k
        require(lpVault.navAssets() == 16_000_000_000, "NAV did not drop by bad debt");
        require(lpVault.sharePriceWad() == 0.8e18, "share price mismatch");

        // Record bad debt in LP vault so cumulativeBadDebt is 4k locally
        vm.prank(CONTROLLER);
        lpVault.recordBadDebt(4_000_000_000);
        require(lpVault.cumulativeBadDebt() == 4_000_000_000, "local debt not 4k");

        // Insurance covers FULL 4k bad debt
        usdc.mint(address(marginVault), 4_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(4_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "margin uncovered debt not zero");

        // CRITICAL CHECK: Without calling reconcileBadDebt(), LP NAV IMMEDIATELY restores to 20k!
        // Local cumulativeBadDebt is STILL 4k, but navAssets() queries live marginVault and sees 0 debt!
        require(lpVault.cumulativeBadDebt() == 4_000_000_000, "reconcile was called prematurely");
        require(lpVault.navAssets() == 20_000_000_000, "NAV did not immediately recover without reconcile!");
        require(lpVault.sharePriceWad() == 1.0e18, "share price did not immediately recover to 1.0!");

        // Calling reconcileBadDebt() now merely syncs the local variable
        lpVault.reconcileBadDebt();
        require(lpVault.cumulativeBadDebt() == 0, "reconcile didn't reset local variable");
        require(lpVault.navAssets() == 20_000_000_000, "NAV changed after reconcile");
    }

    // 2. NAV Accounting under extreme edge cases: margin insolvency, partial recovery, allocated capital exceeding recoverable equity
    function testNAVAccountingWithImpairedAndExcessAllocatedCapital() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 10k, allocates 8k (leaves 2k liquid in LP vault)
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(8_000_000_000);

        address trader = address(0x333);
        usdc.mint(trader, 2_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(2_000_000_000);

        // Margin vault has 10k rawCash (8k LP + 2k trader).
        // Pending positive PnL spikes to 15k (exceeds total rawCash -> margin vault is economically insolvent!)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(15_000_000_000);

        // Trader liabilities = 2k free + 15k pending PnL = 17k.
        // rawCash (10k) < traderLiabilities (17k).
        // marginNetEquity = 0.
        // LP navAssets() = 2k liquid + 0 marginNetEquity = 2k (no underflow!).
        require(lpVault.navAssets() == 2_000_000_000, "NAV underflow on margin insolvency");
        require(lpVault.sharePriceWad() == 0.2e18, "share price underflow");

        // Partial recovery: trader settles with 5k profit (reducing pending PnL to 0, credited to trader)
        // Lock trader's 2k collateral first, then settle with 5k profit
        vm.prank(engine);
        marginVault.lockCollateral(trader, 2_000_000_000);
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0);
        vm.prank(engine);
        marginVault.settlePosition(trader, 2_000_000_000, 5_000_000_000);

        // Trader free collateral becomes 7k. rawCash is 10k.
        // traderLiabilities = 7k free + 0 locked + 0 pending = 7k.
        // marginNetEquity = 10k - 7k = 3k.
        // Allocated capital is 8k, but recoverable net equity is only 3k (allocatedCapital > recoverable equity)!
        // LP navAssets() = 2k liquid + min(8k, 3k) = 5k.
        require(lpVault.navAssets() == 5_000_000_000, "NAV failed to cap at recoverable equity");
        require(lpVault.sharePriceWad() == 0.5e18, "share price not 0.5");
    }

    // 3. Liability categories disjoint proof across all states
    function testTraderLiabilitiesAreStrictlyDisjointAndNonOverlapping() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        address traderA = address(0xAAA);
        address traderB = address(0xBBB);
        usdc.mint(traderA, 20_000_000_000);
        usdc.mint(traderB, 20_000_000_000);

        vm.prank(traderA);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(traderB);
        usdc.approve(address(marginVault), type(uint256).max);

        // Step 1: Trader A deposits 10k
        vm.prank(traderA);
        marginVault.deposit(10_000_000_000);
        require(marginVault.totalFreeCollateral() == 10_000_000_000, "step 1 free");
        require(marginVault.totalLockedCollateral() == 0, "step 1 locked");
        require(marginVault.pendingPositivePnl() == 0, "step 1 pnl");
        require(marginVault.traderLiabilities() == 10_000_000_000, "step 1 total");

        // Step 2: Trader A opens position, locking 4k collateral
        vm.prank(engine);
        marginVault.lockCollateral(traderA, 4_000_000_000);
        require(marginVault.totalFreeCollateral() == 6_000_000_000, "step 2 free");
        require(marginVault.totalLockedCollateral() == 4_000_000_000, "step 2 locked");
        require(marginVault.pendingPositivePnl() == 0, "step 2 pnl");
        // Invariant: sum remains exactly 10k!
        require(marginVault.traderLiabilities() == 10_000_000_000, "step 2 disjoint sum");

        // Step 3: Position has 2k unrealized positive profit
        vm.prank(engine);
        marginVault.setPendingPositivePnl(2_000_000_000);
        require(marginVault.totalFreeCollateral() == 6_000_000_000, "step 3 free");
        require(marginVault.totalLockedCollateral() == 4_000_000_000, "step 3 locked");
        require(marginVault.pendingPositivePnl() == 2_000_000_000, "step 3 pnl");
        require(marginVault.traderLiabilities() == 12_000_000_000, "step 3 disjoint sum");

        // Step 4: Position settles with profit: 4k unlocked, 2k profit realized
        vm.prank(engine);
        marginVault.settlePosition(traderA, 4_000_000_000, 2_000_000_000);
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0);
        require(marginVault.totalFreeCollateral() == 12_000_000_000, "step 4 free");
        require(marginVault.totalLockedCollateral() == 0, "step 4 locked");
        require(marginVault.pendingPositivePnl() == 0, "step 4 pnl");
        require(marginVault.traderLiabilities() == 12_000_000_000, "step 4 disjoint sum");

        // Step 5: Trader B deposits 5k, locks 5k, and is liquidated with 3k bad debt
        vm.prank(traderB);
        marginVault.deposit(5_000_000_000);
        vm.prank(engine);
        marginVault.lockCollateral(traderB, 5_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(traderB, 5_000_000_000, -8_000_000_000); // 5k - 8k = 3k bad debt
        require(marginVault.freeCollateral(traderB) == 0, "step 5 b free zero");
        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "step 5 bad debt");
        // Trader B liabilities are 0; Trader A liabilities are 12k
        require(marginVault.traderLiabilities() == 12_000_000_000, "step 5 liabilities");

        // Step 6: Trader A withdraws all 12k
        // First deposit protocol backing so vault has cash
        usdc.mint(address(marginVault), 10_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(3_000_000_000);

        vm.prank(traderA);
        marginVault.withdraw(12_000_000_000);
        require(marginVault.totalFreeCollateral() == 0, "step 6 free zero");
        require(marginVault.totalLockedCollateral() == 0, "step 6 locked zero");
        require(marginVault.pendingPositivePnl() == 0, "step 6 pnl zero");
        require(marginVault.traderLiabilities() == 0, "step 6 liabilities zero");
    }

    // 4. Custody invariants under complete stateful sequence
    function testCustodyInvariantsUnderComplexSequence() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // Sequence: deposit -> allocate -> trader deposit -> trade -> liquidate -> partial return -> fee record -> withdrawal

        // 1. LP Deposit 30k
        vm.prank(LP1);
        lpVault.deposit(30_000_000_000);
        assertCustodyInvariants("1. deposit");

        // 2. Allocate 20k to margin vault
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(20_000_000_000);
        assertCustodyInvariants("2. allocate");

        // 3. Trader deposits 10k
        address trader = address(0x123);
        usdc.mint(trader, 10_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(10_000_000_000);
        assertCustodyInvariants("3. trader deposit");

        // 4. Trade: lock 5k collateral
        vm.prank(engine);
        marginVault.lockCollateral(trader, 5_000_000_000);
        assertCustodyInvariants("4. trade lock");

        // 5. Liquidate: settle with 7k loss (2k bad debt)
        vm.prank(engine);
        marginVault.settlePosition(trader, 5_000_000_000, -7_000_000_000);
        assertCustodyInvariants("5. liquidate");

        // 6. Partial return of 5k capital from margin vault to LP vault
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(5_000_000_000);
        assertCustodyInvariants("6. partial return");

        // 7. Accrue and transfer 500 fee from margin vault to LP vault
        address trader2 = address(0x456);
        usdc.mint(trader2, 1_000_000_000);
        vm.prank(trader2);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader2);
        marginVault.deposit(1_000_000_000);

        vm.prank(engine);
        marginVault.collectFee(trader2, 500_000_000);
        vm.prank(address(lpVault));
        marginVault.transferFeesToLP(500_000_000);
        assertCustodyInvariants("7. fee record");

        // 8. Withdrawal request & claim
        vm.prank(LP1);
        lpVault.requestWithdraw(5_000_000_000);
        vm.warp(vm.getBlockTimestamp() + 86401);
        vm.prank(LP1);
        lpVault.claimWithdraw();
        assertCustodyInvariants("8. withdrawal");
    }

    function assertCustodyInvariants(string memory step) internal view {
        // Invariant 1: Margin vault rawCash == physical USDC token balance
        require(
            marginVault.rawCash() == usdc.balanceOf(address(marginVault)),
            string(abi.encodePacked("margin vault rawCash != physical balance at: ", step))
        );

        // Invariant 2: LP vault liquid custody == physical USDC token balance
        require(
            lpVault.liquidCustodyUsdc() == usdc.balanceOf(address(lpVault)),
            string(abi.encodePacked("LP liquidCustody != physical balance at: ", step))
        );

        // Invariant 3: Total managedAssets bounded by physical assets (surplus >= 0)
        (PublicLPVault.CustodyStatus status, uint256 custody, uint256 managed,) = lpVault.custodyStatus();
        require(
            status == PublicLPVault.CustodyStatus.MATCH || status == PublicLPVault.CustodyStatus.SURPLUS,
            string(abi.encodePacked("LP vault custody deficit at: ", step))
        );
        require(custody >= managed, string(abi.encodePacked("custody < managed at: ", step)));
    }

    // 5. Governance lifecycle and timelock execution proof
    function testCompleteGovernanceLifecycleAndMultisigExecution() public {
        address deployer = address(0xDDEE);
        address multisigSafe = address(0x5AFE);

        // Deploy fresh ProtocolTimelock (minDelay = 2 days) and PublicLPVault
        vm.prank(deployer);
        ProtocolTimelock timelock = new ProtocolTimelock(172800);

        vm.prank(deployer);
        PublicLPVault freshLp = new PublicLPVault(address(usdc), 86400);

        // 1. Set Multi-Sig as GOVERNANCE_ADMIN_ROLE and governance executor on timelock BEFORE finalization
        bytes32 govRole = timelock.GOVERNANCE_ADMIN_ROLE();
        vm.prank(deployer);
        timelock.setRole(govRole, multisigSafe, true);
        vm.prank(deployer);
        timelock.setGovernanceExecutor(multisigSafe);

        // 2. Set timelock as governance executor and set risk controller on freshLp
        vm.prank(deployer);
        freshLp.setGovernanceExecutor(address(timelock));
        vm.prank(deployer);
        freshLp.setRiskController(CONTROLLER);

        // 3. Finalize bootstrap on both contracts
        vm.prank(deployer);
        timelock.finalizeBootstrap();
        vm.prank(deployer);
        freshLp.finalizeBootstrap();

        // 4. Verify deployer bypass is completely EXTINGUISHED
        // Deployer cannot call privileged function directly
        vm.prank(deployer);
        vm.expectRevert();
        freshLp.setPublicLpActive(true);

        // Deployer cannot set roles or queue operations on timelock
        vm.prank(deployer);
        vm.expectRevert();
        timelock.queue(address(freshLp), 0, abi.encodeWithSelector(freshLp.setPublicLpActive.selector, true), bytes32(0));

        // 5. Multi-Sig queues operation on timelock
        bytes memory callData = abi.encodeWithSelector(freshLp.setPublicLpActive.selector, true);
        bytes32 salt = keccak256("activate_lp");
        vm.prank(multisigSafe);
        bytes32 opId = timelock.queue(address(freshLp), 0, callData, salt);
        require(timelock.queuedAt(opId) != 0, "operation not queued");

        // Attempting to execute before delay reverts with OperationNotReady
        vm.prank(multisigSafe);
        vm.expectRevert();
        timelock.execute(address(freshLp), 0, callData, salt);

        // 6. Warp time past timelock minDelay (172,801 seconds)
        vm.warp(vm.getBlockTimestamp() + 172801);

        // Execution succeeds atomically via timelock
        timelock.execute(address(freshLp), 0, callData, salt);
        require(freshLp.publicLpActive() == true, "LP vault not activated via timelock");
    }

    // =========================================================================
    // FOURTH-PASS ADVERSARIAL SUITE
    // =========================================================================

    // 1. Authoritative Bad-Debt Read Failures: Unset Vault Uses Standalone Accounting
    function testUnsetVaultUsesStandaloneAccounting() public {
        PublicLPVault standalone = new PublicLPVault(address(usdc), 86400);
        standalone.setRiskController(CONTROLLER);
        standalone.setGovernanceExecutor(EXECUTOR);
        standalone.finalizeBootstrap();
        vm.prank(EXECUTOR);
        standalone.setPublicLpActive(true);

        vm.prank(LP1);
        usdc.approve(address(standalone), type(uint256).max);
        vm.prank(LP1);
        standalone.deposit(10_000_000_000); // 10k

        require(standalone.authorizedMarginVault() == address(0), "vault should be unset");
        require(standalone.navAssets() == 10_000_000_000, "nav mismatch");
        require(standalone.sharePriceWad() == 1e18, "price mismatch");

        // Record standalone bad debt
        vm.prank(CONTROLLER);
        standalone.recordBadDebt(2_500_000_000); // 2.5k bad debt

        require(standalone.cumulativeBadDebt() == 2_500_000_000, "bad debt mismatch");
        require(standalone.navAssets() == 7_500_000_000, "nav did not drop by standalone bad debt");
        require(standalone.sharePriceWad() == 0.75e18, "price did not drop to 0.75");
        require(usdc.balanceOf(address(standalone)) == 10_000_000_000, "balance mismatch");
        require(standalone.managedAssets() == 10_000_000_000, "managed assets mismatch");
    }

    // 2. Authoritative Bad-Debt Read Failures: Configured Reverting Vault Fails Closed
    function testConfiguredVaultRevertsOnReadFailureFailClosed() public {
        PublicLPVault badLp = new PublicLPVault(address(usdc), 86400);
        badLp.setRiskController(CONTROLLER);
        badLp.setGovernanceExecutor(EXECUTOR);
        badLp.setRole(badLp.EMERGENCY_ADMIN_ROLE(), EMERGENCY, true);
        badLp.finalizeBootstrap();

        vm.prank(EXECUTOR);
        badLp.setPublicLpActive(true);

        // LP deposits initial capital in standalone mode
        vm.prank(LP1);
        usdc.approve(address(badLp), type(uint256).max);
        vm.prank(LP1);
        badLp.deposit(10_000_000_000);
        require(badLp.totalShares() == 10_000_000_000, "initial shares");

        // Governance wires a reverting margin vault
        RevertingMarginVault revVault = new RevertingMarginVault();
        vm.prank(EXECUTOR);
        badLp.setAuthorizedMarginVault(address(revVault));

        // 1. navAssets() must revert with MarginVaultQueryFailed, never silently substitute zero
        vm.expectRevert();
        badLp.navAssets();

        // 2. sharePriceWad() must revert fail-closed
        vm.expectRevert();
        badLp.sharePriceWad();

        // 3. Deposits must revert fail-closed
        vm.prank(LP2);
        usdc.approve(address(badLp), type(uint256).max);
        vm.prank(LP2);
        vm.expectRevert();
        badLp.deposit(1_000_000_000);

        // 4. Withdrawal requests can be queued, but claims revert fail-closed
        vm.prank(LP1);
        badLp.requestWithdraw(5_000_000_000);
        vm.warp(vm.getBlockTimestamp() + 86401);

        vm.prank(LP1);
        vm.expectRevert();
        badLp.claimWithdraw();

        // 5. Emergency pause succeeds without calling navAssets()
        vm.prank(EMERGENCY);
        badLp.emergencyPausePublicLp();
        require(badLp.publicLpActive() == false, "LP active should be paused");
    }

    // 3. Adversarial Accounting: Allocated Capital Impaired by Losses
    function testAdversarialAllocatedCapitalImpairedByLosses() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 50k, allocates 40k to margin vault (10k remains liquid in LP vault)
        vm.prank(LP1);
        lpVault.deposit(50_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(40_000_000_000);

        // Trader deposits 10k, locks 10k
        address trader = address(0x111);
        usdc.mint(trader, 10_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(10_000_000_000);
        vm.prank(engine);
        marginVault.lockCollateral(trader, 10_000_000_000);

        // Trader liquidated: settles with 35k loss (10k locked absorbed + 25k bad debt)
        vm.prank(engine);
        marginVault.settlePosition(trader, 10_000_000_000, -35_000_000_000);

        // Assert all states:
        uint256 lpTokenBalance = usdc.balanceOf(address(lpVault));
        uint256 marginTokenBalance = usdc.balanceOf(address(marginVault));
        uint256 rawCash = marginVault.rawCash();
        uint256 liabilities = marginVault.traderLiabilities();
        uint256 badDebt = marginVault.cumulativeUncoveredBadDebt();
        uint256 allocCapital = lpVault.allocatedCapital();
        uint256 managed = lpVault.managedAssets();
        uint256 nav = lpVault.navAssets();
        uint256 price = lpVault.sharePriceWad();

        require(lpTokenBalance == 10_000_000_000, "lpTokenBalance mismatch");
        require(marginTokenBalance == 50_000_000_000, "marginTokenBalance mismatch");
        require(rawCash == 50_000_000_000, "rawCash mismatch");
        require(liabilities == 0, "trader liabilities mismatch");
        require(badDebt == 25_000_000_000, "bad debt mismatch");
        require(allocCapital == 40_000_000_000, "allocatedCapital mismatch");
        require(managed == 50_000_000_000, "managedAssets mismatch");
        // NAV = 10k liquid + 40k alloc - 25k debt = 25k
        require(nav == 25_000_000_000, "NAV mismatch on loss impairment");
        require(price == 0.5e18, "share price mismatch (should be 0.5)");
    }

    // 4. Adversarial Accounting: Trader Liabilities Exceed Margin Cash
    function testAdversarialTraderLiabilitiesGreaterThanMarginCash() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 20k, allocates 15k (5k liquid in LP vault)
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        // Trader deposits 5k
        address trader = address(0x222);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);

        // Winning traders have 30k unrealized profit (pendingPositivePnl)
        // Margin vault rawCash is 20k (15k LP + 5k trader)
        // Trader liabilities = 5k free + 30k pending = 35k > 20k rawCash!
        vm.prank(engine);
        marginVault.setPendingPositivePnl(30_000_000_000);

        uint256 rawCash = marginVault.rawCash();
        uint256 liabilities = marginVault.traderLiabilities();
        uint256 allocCapital = lpVault.allocatedCapital();
        uint256 managed = lpVault.managedAssets();
        uint256 nav = lpVault.navAssets();
        uint256 price = lpVault.sharePriceWad();

        require(rawCash == 20_000_000_000, "rawCash mismatch");
        require(liabilities == 35_000_000_000, "liabilities mismatch");
        require(allocCapital == 15_000_000_000, "allocCapital mismatch");
        require(managed == 20_000_000_000, "managed mismatch");
        // Recoverable margin equity is 0 because cash < liabilities.
        // LP NAV is strictly bounded to the 5k unallocated liquid cash in LP vault.
        require(nav == 5_000_000_000, "NAV underflow or mismatch");
        require(price == 0.25e18, "price mismatch (should be 0.25)");
    }

    // 5. Adversarial Accounting: Accrued Fees Before and After Transfer
    function testAdversarialAccruedFeesBeforeAndAfterTransfer() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(5_000_000_000);

        address trader = address(0x333);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);

        // Engine collects 1k fee from trader free collateral into accruedFees
        vm.prank(engine);
        marginVault.collectFee(trader, 1_000_000_000);

        // BEFORE TRANSFER: Fee sits in marginVault.accruedFees, LP NAV does NOT recognize it yet
        require(marginVault.accruedFees() == 1_000_000_000, "accruedFees mismatch");
        require(lpVault.navAssets() == 10_000_000_000, "NAV prematurely recognized fee");
        require(lpVault.sharePriceWad() == 1.0e18, "price prematurely increased");

        // TRANSFER: Atomically transfer 1k fee to LP vault
        vm.prank(address(lpVault));
        marginVault.transferFeesToLP(1_000_000_000);

        // AFTER TRANSFER: Fee atomically expands LP managed assets and NAV
        require(marginVault.accruedFees() == 0, "accruedFees not decremented");
        require(lpVault.managedAssets() == 11_000_000_000, "managed assets did not expand");
        require(lpVault.navAssets() == 11_000_000_000, "NAV did not expand");
        require(lpVault.sharePriceWad() == 1.1e18, "price did not expand to 1.1");
    }

    // 6. Adversarial Accounting: Partial and Complete Insurance Recovery
    function testAdversarialPartialAndCompleteInsuranceRecovery() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        address trader = address(0x444);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);
        vm.prank(engine);
        marginVault.lockCollateral(trader, 5_000_000_000);

        // Settle with 15k loss (5k collateral + 10k bad debt)
        vm.prank(engine);
        marginVault.settlePosition(trader, 5_000_000_000, -15_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 10_000_000_000, "bad debt mismatch");
        require(lpVault.navAssets() == 10_000_000_000, "nav mismatch after loss");
        require(lpVault.sharePriceWad() == 0.5e18, "price mismatch after loss");

        // PARTIAL INSURANCE RECOVERY: Insurance covers 4k
        usdc.mint(address(marginVault), 4_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(4_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 6_000_000_000, "remaining bad debt mismatch");
        // NAV immediately recovers 4k to 14k without requiring reconcileBadDebt()!
        require(lpVault.navAssets() == 14_000_000_000, "NAV did not partially recover");
        require(lpVault.sharePriceWad() == 0.7e18, "price did not partially recover to 0.7");

        // COMPLETE INSURANCE RECOVERY: Insurance covers remaining 6k
        usdc.mint(address(marginVault), 6_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(6_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "uncovered bad debt not 0");
        // NAV immediately restores to full 20k fair value!
        require(lpVault.navAssets() == 20_000_000_000, "NAV did not fully recover to 20k");
        require(lpVault.sharePriceWad() == 1.0e18, "price did not fully recover to 1.0");
    }

    // 7. Adversarial Accounting: Direct USDC Donations to Both Vaults
    function testAdversarialDirectUSDCDonationsToBothVaults() public {
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(5_000_000_000);

        // Attacker donates 100k USDC directly to PublicLPVault
        usdc.mint(address(lpVault), 100_000_000_000);
        // Attacker donates 100k USDC directly to USDCMarginVault
        usdc.mint(address(marginVault), 100_000_000_000);

        // Invariants: NAV and share price must remain 100% UNCHANGED
        require(lpVault.navAssets() == 10_000_000_000, "LP NAV inflated by donation");
        require(lpVault.sharePriceWad() == 1.0e18, "LP share price inflated by donation");

        // Custody status detects surplus
        (PublicLPVault.CustodyStatus status,,, uint256 surplus) = lpVault.custodyStatus();
        require(status == PublicLPVault.CustodyStatus.SURPLUS, "expected surplus");
        require(surplus == 100_000_000_000, "surplus amount mismatch");

        // LP2 deposits at fair 1:1 price
        vm.prank(LP2);
        uint256 lp2Shares = lpVault.deposit(5_000_000_000);
        require(lp2Shares == 5_000_000_000, "LP2 diluted by donation");
    }

    // 8. Adversarial Accounting: Failed Token Transfers Revert Atomically
    function testAdversarialFailedUSDCTransfersAndCrossContractCalls() public {
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);

        // Failed deposit reverts
        usdc.setFailTransfers(true);
        vm.prank(LP2);
        vm.expectRevert();
        lpVault.deposit(5_000_000_000);
        require(lpVault.totalShares() == 10_000_000_000, "shares minted on failed deposit");

        // Restore transfers
        usdc.setFailTransfers(false);

        // Queue withdrawal
        vm.prank(LP1);
        lpVault.requestWithdraw(5_000_000_000);
        vm.warp(vm.getBlockTimestamp() + 86401);

        // Failed withdrawal transfer reverts without burning shares
        usdc.setFailTransfers(true);
        vm.prank(LP1);
        vm.expectRevert();
        lpVault.claimWithdraw();
        require(lpVault.shareBalance(LP1) == 10_000_000_000, "shares burned on failed claim");

        usdc.setFailTransfers(false);
    }

    // 9. Adversarial Accounting: Withdrawal Claims During Margin Impairment
    function testAdversarialWithdrawalRequestsAndClaimsDuringImpairment() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP1 and LP2 each deposit 20k (40k total, NAV = 40k)
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(LP2);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(30_000_000_000);

        // LP1 requests withdrawal of all 20k shares
        vm.prank(LP1);
        lpVault.requestWithdraw(20_000_000_000);

        // During 24h cooldown, margin vault suffers 20k loss (bad debt)
        address trader = address(0x555);
        usdc.mint(trader, 5_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(5_000_000_000);
        vm.prank(engine);
        marginVault.lockCollateral(trader, 5_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(trader, 5_000_000_000, -25_000_000_000); // 20k bad debt

        require(lpVault.navAssets() == 20_000_000_000, "NAV did not drop to 20k");
        require(lpVault.sharePriceWad() == 0.5e18, "share price did not drop to 0.5");

        // Cooldown expires
        vm.warp(vm.getBlockTimestamp() + 86401);

        // Return 10k capital from margin vault to ensure LP vault has liquid cash to pay
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(10_000_000_000);

        // LP1 claims withdrawal: receives fair IMPAIRED payout of 10k (not 20k!)
        uint256 lp1BalBefore = usdc.balanceOf(LP1);
        vm.prank(LP1);
        uint256 payout = lpVault.claimWithdraw();

        require(payout == 10_000_000_000, "LP1 received unimpaired payout!");
        require(usdc.balanceOf(LP1) - lp1BalBefore == 10_000_000_000, "actual payout mismatch");

        // Remaining LP2 retains 20k shares backed by remaining 10k assets (share price remains 0.5e18)
        require(lpVault.totalShares() == 20_000_000_000, "remaining shares mismatch");
        require(lpVault.navAssets() == 10_000_000_000, "remaining NAV mismatch");
        require(lpVault.sharePriceWad() == 0.5e18, "remaining share price crashed");
    }

    // 10. Adversarial Accounting: Multiple LP Deposits and Withdrawals Across NAV Changes
    function testAdversarialMultipleDepositsAndWithdrawalsAcrossNAVChanges() public {
        // Step 1: LP1 deposits 10k at $1.00 -> 10k shares
        vm.prank(LP1);
        lpVault.deposit(10_000_000_000);
        require(lpVault.totalShares() == 10_000_000_000, "step 1 shares");
        require(lpVault.sharePriceWad() == 1.0e18, "step 1 price");

        // Step 2: Protocol earns 2k fee -> NAV = 12k, share price = $1.20
        usdc.mint(LP1, 2_000_000_000);
        vm.prank(LP1);
        usdc.approve(address(lpVault), type(uint256).max);
        vm.prank(LP1);
        lpVault.depositFeeRevenue(2_000_000_000);
        require(lpVault.navAssets() == 12_000_000_000, "step 2 nav");
        require(lpVault.sharePriceWad() == 1.2e18, "step 2 price");

        // Step 3: LP2 deposits 6k at $1.20 -> mints exactly 5k shares (6k / 1.2)
        vm.prank(LP2);
        uint256 lp2Shares = lpVault.deposit(6_000_000_000);
        require(lp2Shares == 5_000_000_000, "LP2 fair share minting mismatch");
        require(lpVault.totalShares() == 15_000_000_000, "step 3 total shares");
        require(lpVault.navAssets() == 18_000_000_000, "step 3 nav");
        require(lpVault.sharePriceWad() == 1.2e18, "step 3 price unchanged after fair deposit");

        // Step 4: LP1 requests withdrawal of 5k shares
        vm.prank(LP1);
        lpVault.requestWithdraw(5_000_000_000);
        vm.warp(vm.getBlockTimestamp() + 86401);

        // Step 5: LP1 claims: 5k shares * 1.2 = 6k USDC payout
        uint256 lp1BalBefore = usdc.balanceOf(LP1);
        vm.prank(LP1);
        uint256 payout = lpVault.claimWithdraw();
        require(payout == 6_000_000_000, "LP1 claim payout mismatch");
        require(usdc.balanceOf(LP1) - lp1BalBefore == 6_000_000_000, "LP1 token balance mismatch");
        require(lpVault.totalShares() == 10_000_000_000, "step 5 total shares");
        require(lpVault.navAssets() == 12_000_000_000, "step 5 nav");
        require(lpVault.sharePriceWad() == 1.2e18, "step 5 price invariant");
    }

    // 11. Fee Path Under Impairment: Reverts When Withdrawable Liquidity is Insolvent
    function testFeePathWhenMarginVaultCashImpairedAndTraderLiabilitiesOutstanding() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // Margin vault has 10k rawCash, but 15k trader liabilities
        address trader = address(0x777);
        usdc.mint(trader, 10_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(10_000_000_000);

        vm.prank(engine);
        marginVault.setPendingPositivePnl(5_000_000_000); // 10k free + 5k pending = 15k liabilities

        // Trader pays 1k fee into accruedFees
        vm.prank(engine);
        marginVault.collectFee(trader, 1_000_000_000);
        require(marginVault.accruedFees() == 1_000_000_000, "accruedFees mismatch");

        // Attempting to transfer fees to LP when withdrawableLiquidity == 0 must REVERT!
        require(marginVault.withdrawableLiquidity() == 0, "withdrawableLiquidity should be 0");
        vm.prank(address(lpVault));
        vm.expectRevert();
        marginVault.transferFeesToLP(1_000_000_000);

        // Restore solvency: deposit protocol backing / insurance coverage
        usdc.mint(address(marginVault), 10_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(10_000_000_000); // 10k real cash into rawCash
        require(marginVault.withdrawableLiquidity() >= 1_000_000_000, "solvency not restored");

        // Now transfer succeeds atomically
        vm.prank(address(lpVault));
        marginVault.transferFeesToLP(1_000_000_000);
        require(marginVault.accruedFees() == 0, "fees not transferred");
    }

    // 12. Governance Lockout Negative Test: Bricked Timelock When Finalized Out-of-Order
    function testGovernanceLockoutPermanentIfFinalizedBeforeMultisigAdmin() public {
        address deployer = address(0xDEAD);
        address multisigSafe = address(0xBEEF);

        // Deploy timelock
        vm.prank(deployer);
        ProtocolTimelock timelock = new ProtocolTimelock(86400);

        // Deployer sets governance executor to multisig, but FAILS to set GOVERNANCE_ADMIN_ROLE
        vm.prank(deployer);
        timelock.setGovernanceExecutor(multisigSafe);

        // Deployer prematurely finalizes bootstrap!
        vm.prank(deployer);
        timelock.finalizeBootstrap();

        // 1. Deployer can no longer grant role (BootstrapAlreadyFinalized)
        bytes32 govRole = timelock.GOVERNANCE_ADMIN_ROLE();
        vm.prank(deployer);
        vm.expectRevert();
        timelock.setRole(govRole, multisigSafe, true);

        // 2. Deployer cannot queue operations (NotOwner)
        vm.prank(deployer);
        vm.expectRevert();
        timelock.queue(address(0x123), 0, "", bytes32(0));

        // 3. Multi-Sig cannot queue operations (NotOwner because role was never granted)
        vm.prank(multisigSafe);
        vm.expectRevert();
        timelock.queue(address(0x123), 0, "", bytes32(0));

        // Contract is permanently bricked and unusable!
    }

    // =========================================================================
    // FIFTH-PASS TESTS: DEDICATED LOSS RECOGNITION & TIMELOCK SELF-GOVERNANCE
    // =========================================================================

    // A.4.1 Actual Contract Flow: Realized Loss Reduces Margin Vault Cash (Zero LP Impairment)
    function testActualFlowRealizedLossReducesMarginVaultCash() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 20k, allocates 15k to margin vault (5k liquid in LP vault)
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        address traderA = address(0xAA1);
        address traderB = address(0xBB1);
        usdc.mint(traderA, 10_000_000_000);
        usdc.mint(traderB, 10_000_000_000);

        vm.prank(traderA);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(traderB);
        usdc.approve(address(marginVault), type(uint256).max);

        // Trader A and Trader B deposit 10k each
        vm.prank(traderA);
        marginVault.deposit(10_000_000_000);
        vm.prank(traderB);
        marginVault.deposit(10_000_000_000);

        // Lock 5k for each trader
        vm.prank(engine);
        marginVault.lockCollateral(traderA, 5_000_000_000);
        vm.prank(engine);
        marginVault.lockCollateral(traderB, 5_000_000_000);

        // Trader B loses 5k; Trader A gains 5k
        vm.prank(engine);
        marginVault.settlePosition(traderB, 5_000_000_000, -5_000_000_000); // 5k loss covered by locked collateral
        vm.prank(engine);
        marginVault.settlePosition(traderA, 5_000_000_000, 5_000_000_000);  // 5k gain credited to free collateral

        require(marginVault.freeCollateral(traderB) == 5_000_000_000, "traderB remaining free");
        require(marginVault.freeCollateral(traderA) == 15_000_000_000, "traderA free with profit");
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "no bad debt generated");

        // Trader A withdraws all 15k cash from margin vault
        vm.prank(traderA);
        marginVault.withdraw(15_000_000_000);

        // Realized loss directly reduced margin vault rawCash from 35k to 20k!
        require(marginVault.rawCash() == 20_000_000_000, "rawCash mismatch after withdrawal");
        require(usdc.balanceOf(address(marginVault)) == 20_000_000_000, "token balance mismatch");

        // Trader liabilities = Trader B's 5k free collateral
        require(marginVault.traderLiabilities() == 5_000_000_000, "liabilities mismatch");

        // Net margin equity: rawCash (20k) - liabilities (5k) = 15k = LP protocol backing!
        // LP NAV is 100% PRESERVED at 20k (5k liquid + 15k net margin equity)
        require(lpVault.navAssets() == 20_000_000_000, "LP NAV impaired by trader-funded loss");
        require(lpVault.sharePriceWad() == 1.0e18, "LP share price impaired");

        // LP can return full 15k backing without error
        vm.prank(CONTROLLER);
        lpVault.returnFromMarginVault(15_000_000_000);
        require(lpVault.liquidCustodyUsdc() == 20_000_000_000, "LP failed to recall backing");
    }

    // A.4.2 Actual Contract Flow: Loss Creates Uncovered Debt Claim (Single Recognition)
    function testActualFlowLossCreatesUncoveredDebtClaim() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 20k, allocates 15k
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        address trader = address(0xCC1);
        usdc.mint(trader, 2_000_000_000);
        vm.prank(trader);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(trader);
        marginVault.deposit(2_000_000_000);

        vm.prank(engine);
        marginVault.lockCollateral(trader, 2_000_000_000);

        // Trader liquidated with 5k loss: 2k collateral absorbed + 3k bad debt
        vm.prank(engine);
        marginVault.settlePosition(trader, 2_000_000_000, -5_000_000_000);

        // Margin vault state
        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "bad debt claim not 3k");
        require(marginVault.traderLiabilities() == 0, "trader liabilities not 0");
        require(marginVault.rawCash() == 17_000_000_000, "rawCash not 17k");

        // LP vault recognizes the 3k uncovered bad debt EXACTLY ONCE
        // Gross assets: 5k liquid + min(15k, 17k) = 20k
        // Debt to deduct: 3k
        // Net NAV = 20k - 3k = 17k (drop of exactly 3k)
        require(lpVault.navAssets() == 17_000_000_000, "NAV did not recognize debt claim");
        require(lpVault.sharePriceWad() == 0.85e18, "share price did not drop to 0.85");
    }

    // A.4.3 Actual Contract Flow: ADL Coverage Restores LP NAV
    function testActualFlowADLCoverageRestoresNAV() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits 20k, allocates 15k
        vm.prank(LP1);
        lpVault.deposit(20_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(15_000_000_000);

        // Trader A deposits 2k, loses 5k -> creates 3k bad debt
        address traderA = address(0xCC1);
        usdc.mint(traderA, 2_000_000_000);
        vm.prank(traderA);
        usdc.approve(address(marginVault), type(uint256).max);
        vm.prank(traderA);
        marginVault.deposit(2_000_000_000);

        vm.prank(engine);
        marginVault.lockCollateral(traderA, 2_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(traderA, 2_000_000_000, -5_000_000_000); // 3k bad debt

        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "bad debt mismatch");
        require(lpVault.navAssets() == 17_000_000_000, "initial impaired NAV");

        // Counterparty winning trader has 3k unrealized profit (pendingPositivePnl)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(3_000_000_000);

        // ADL executed by engine: socializes 3k debt against the winning trader
        vm.prank(engine);
        marginVault.applyADLResolution(3_000_000_000);
        // Engine haircuts the winning trader's pending profit by 3k
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0);

        // On-chain uncovered bad debt is now 0!
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "uncovered bad debt not 0 after ADL");

        // LP NAV immediately restores to full 20k fair value!
        require(lpVault.navAssets() == 20_000_000_000, "NAV did not restore after ADL");
        require(lpVault.sharePriceWad() == 1.0e18, "share price did not restore after ADL");
    }

    // B.2 & B.4 Timelock Self-Governance: Role Changes on Timelock Require Timelock Queue & Delay
    function testTimelockSelfGovernanceAndRoleDelayEnforcement() public {
        address deployer = address(0xEE11);
        address multisigSafe = address(0xEE22);
        address newAdmin = address(0xEE33);

        // 1. Deploy Timelock (minDelay = 2 days = 172800s)
        vm.prank(deployer);
        ProtocolTimelock timelock = new ProtocolTimelock(172800);

        // 2. Grant multisig GOVERNANCE_ADMIN_ROLE
        bytes32 govRole = timelock.GOVERNANCE_ADMIN_ROLE();
        vm.prank(deployer);
        timelock.setRole(govRole, multisigSafe, true);

        // 3. Set timelock as its own governance executor (Self-Governed Timelock)
        vm.prank(deployer);
        timelock.setGovernanceExecutor(address(timelock));

        // 4. Finalize bootstrap
        vm.prank(deployer);
        timelock.finalizeBootstrap();

        // Direct call from multisig to setRole on timelock MUST REVERT (bypassing timelock is impossible!)
        vm.prank(multisigSafe);
        vm.expectRevert();
        timelock.setRole(govRole, newAdmin, true);

        // Multisig queues the role update on timelock
        bytes memory callData = abi.encodeWithSelector(timelock.setRole.selector, govRole, newAdmin, true);
        bytes32 salt = keccak256("grant_new_admin");
        vm.prank(multisigSafe);
        bytes32 opId = timelock.queue(address(timelock), 0, callData, salt);
        require(timelock.queuedAt(opId) != 0, "op not queued");

        // Premature execution reverts (OperationNotReady)
        vm.prank(multisigSafe);
        vm.expectRevert();
        timelock.execute(address(timelock), 0, callData, salt);

        // Cancel test: multisig can cancel
        bytes32 cancelSalt = keccak256("op_to_cancel");
        vm.prank(multisigSafe);
        bytes32 cancelId = timelock.queue(address(timelock), 0, callData, cancelSalt);
        vm.prank(multisigSafe);
        timelock.cancel(cancelId);
        require(timelock.queuedAt(cancelId) == 0, "op not cancelled");

        // Warp time past delay (172,801s)
        vm.warp(vm.getBlockTimestamp() + 172801);

        // Execution succeeds atomically
        timelock.execute(address(timelock), 0, callData, salt);
        require(timelock.hasRole(govRole, newAdmin) == true, "newAdmin role not granted via timelock");
    }

    // =========================================================================
    // SECTION 10: FOCUSED ACCOUNTING CHALLENGE TESTS
    // =========================================================================

    // 1. Independent-Loss Counterexample
    function testIndependentLossCounterexampleFailsOldFormulaSucceedsNew() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // LP deposits $25,000, allocates $20,000 to margin vault (80% allocation ratio)
        vm.prank(LP1);
        lpVault.deposit(25_000_000_000); // 25k deposit
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(20_000_000_000); // exactly 20k allocated capital

        require(lpVault.allocatedCapital() == 20_000_000_000, "initial allocated capital exactly 20k");
        require(lpVault.liquidCustodyUsdc() == 5_000_000_000, "initial liquid custody 5k");
        require(lpVault.navAssets() == 25_000_000_000, "initial NAV 25k");
        require(lpVault.sharePriceWad() == 1.0e18, "initial share price 1.0");

        // Event 1: Unrelated trading impairment reduces recoverable margin equity by $3,000
        // (Winning trader has $3,000 pending positive PnL claim against the pool)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(3_000_000_000);

        require(marginVault.traderLiabilities() == 3_000_000_000, "trader liabilities after event 1");
        require(lpVault.navAssets() == 22_000_000_000, "NAV after event 1 (25k - 3k = 22k)");
        require(lpVault.sharePriceWad() == (22_000_000_000 * 1e18) / 25_000_000_000, "share price after event 1");

        // Event 2: Separate liquidation creates $3,000 of uncovered bad debt
        // (Trader liquidated with 0 residual collateral and -3k loss -> 3k bad debt)
        address trader2 = address(0x888);
        vm.prank(engine);
        marginVault.settlePosition(trader2, 0, -3_000_000_000);

        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "uncovered bad debt after event 2");

        // Mathematical & Economic Proof:
        // - Initial LP equity: $25,000 ($5k local + $20k allocated)
        // - Loss 1 (Senior trader profit obligation): $3,000
        // - Loss 2 (Senior uncovered liquidation bad debt): $3,000
        // - True economic recoverable LP equity: $25,000 - $3,000 - $3,000 = $19,000!
        //
        // In the flawed formula:
        // allocatedImpairment = 20k - 17k = 3k
        // debtToDeduct = 3k
        // netUnabsorbedLoss = max(0, debtToDeduct - allocatedImpairment) = max(0, 3k - 3k) = 0!
        // Flawed NAV = 22k - 0 = 22k (understating loss by $3,000!).
        //
        // In the corrected exact-once loss model:
        require(lpVault.navAssets() == 19_000_000_000, "NAV did not recognize both independent losses!");
        require(lpVault.sharePriceWad() == (19_000_000_000 * 1e18) / 25_000_000_000, "Share price mismatch!");
    }

    // 2. Trace ADL from Source to Final Balances (10 Exact Metrics)
    function testADLTraceBeforeAndAfterBalances() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // Setup: LP deposits 25k, allocates 20k to margin vault
        vm.prank(LP1);
        lpVault.deposit(25_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(20_000_000_000);

        // Create $3,000 pending positive PnL and $3,000 uncovered bad debt
        vm.prank(engine);
        marginVault.setPendingPositivePnl(3_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(address(0x888), 0, -3_000_000_000);

        // Verify BEFORE ADL state across all 10 metrics:
        // Metric 1: rawCash
        require(marginVault.rawCash() == 20_000_000_000, "M1 before: rawCash");
        // Metric 2: totalFreeCollateral
        require(marginVault.totalFreeCollateral() == 0, "M2 before: free collateral");
        // Metric 3: totalLockedCollateral
        require(marginVault.totalLockedCollateral() == 0, "M3 before: locked collateral");
        // Metric 4: pendingPositivePnl
        require(marginVault.pendingPositivePnl() == 3_000_000_000, "M4 before: pending positive PnL");
        // Metric 5: protocolBadDebt
        require(marginVault.protocolBadDebt() == 3_000_000_000, "M5 before: protocol bad debt");
        // Metric 6: insuranceCoveredBadDebt
        require(marginVault.insuranceCoveredBadDebt() == 0, "M6 before: insurance covered bad debt");
        // Metric 7: cumulativeUncoveredBadDebt()
        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "M7 before: uncovered bad debt");
        // Metric 8: allocatedCapital
        require(lpVault.allocatedCapital() == 20_000_000_000, "M8 before: allocated capital");
        // Metric 9: managedAssets
        require(lpVault.managedAssets() == 25_000_000_000, "M9 before: managed assets");
        // Metric 10: NAV & share price
        require(lpVault.navAssets() == 19_000_000_000, "M10 before: NAV");
        require(lpVault.sharePriceWad() == (19_000_000_000 * 1e18) / 25_000_000_000, "M10 before: share price");

        // Execute $3,000 ADL resolution (profitable claim is haircut to clear deficit)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0); // claimant haircut
        vm.prank(engine);
        marginVault.applyADLResolution(3_000_000_000); // deficit reduction

        // Verify AFTER ADL state across all 10 metrics:
        // Metric 1: rawCash (unchanged - ADL is not a cash transfer)
        require(marginVault.rawCash() == 20_000_000_000, "M1 after: rawCash");
        // Metric 2: totalFreeCollateral
        require(marginVault.totalFreeCollateral() == 0, "M2 after: free collateral");
        // Metric 3: totalLockedCollateral
        require(marginVault.totalLockedCollateral() == 0, "M3 after: locked collateral");
        // Metric 4: pendingPositivePnl (reduced by 3k)
        require(marginVault.pendingPositivePnl() == 0, "M4 after: pending positive PnL");
        // Metric 5: protocolBadDebt (reduced by 3k)
        require(marginVault.protocolBadDebt() == 0, "M5 after: protocol bad debt");
        // Metric 6: insuranceCoveredBadDebt
        require(marginVault.insuranceCoveredBadDebt() == 0, "M6 after: insurance covered bad debt");
        // Metric 7: cumulativeUncoveredBadDebt() (cleared to 0)
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "M7 after: uncovered bad debt");
        // Metric 8: allocatedCapital (unchanged)
        require(lpVault.allocatedCapital() == 20_000_000_000, "M8 after: allocated capital");
        // Metric 9: managedAssets (unchanged)
        require(lpVault.managedAssets() == 25_000_000_000, "M9 after: managed assets");
        // Metric 10: NAV & share price (restored to par)
        require(lpVault.navAssets() == 25_000_000_000, "M10 after: NAV restored");
        require(lpVault.sharePriceWad() == 1.0e18, "M10 after: share price restored");
    }

    // 3. ADL Edge Cases: Smaller Than, Equal To, and Greater Than
    function testADLResolutionEdgeCases() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // Setup: 25k deposit, 20k allocated
        vm.prank(LP1);
        lpVault.deposit(25_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(20_000_000_000);

        // Create 3k positive PnL and 3k bad debt
        vm.prank(engine);
        marginVault.setPendingPositivePnl(3_000_000_000);
        vm.prank(engine);
        marginVault.settlePosition(address(0x888), 0, -3_000_000_000);
        require(lpVault.navAssets() == 19_000_000_000, "initial impaired NAV");

        // Case A: ADL amount SMALLER than pending positive PnL and bad debt ($1,000 haircut)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(2_000_000_000); // 1k haircut
        vm.prank(engine);
        marginVault.applyADLResolution(1_000_000_000); // 1k bad debt reduction

        require(marginVault.pendingPositivePnl() == 2_000_000_000, "remaining PnL");
        require(marginVault.protocolBadDebt() == 2_000_000_000, "remaining bad debt");
        require(marginVault.cumulativeUncoveredBadDebt() == 2_000_000_000, "remaining uncovered debt");
        // NAV increases by exactly $2,000 ($1,000 PnL cleared + $1,000 debt cleared)
        require(lpVault.navAssets() == 21_000_000_000, "partial ADL NAV");
        require(lpVault.sharePriceWad() == (21_000_000_000 * 1e18) / 25_000_000_000, "partial ADL share price");

        // Case B: ADL amount EQUAL to remaining bad debt ($2,000 haircut)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0); // remaining 2k haircut
        vm.prank(engine);
        marginVault.applyADLResolution(2_000_000_000); // remaining 2k bad debt reduction

        require(marginVault.pendingPositivePnl() == 0, "final PnL zero");
        require(marginVault.protocolBadDebt() == 0, "final bad debt zero");
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "final uncovered debt zero");
        require(lpVault.navAssets() == 25_000_000_000, "full ADL NAV restored");
        require(lpVault.sharePriceWad() == 1.0e18, "full ADL share price restored");

        // Case C: ADL amount GREATER than remaining uncovered bad debt (assert revert!)
        vm.prank(engine);
        vm.expectRevert();
        marginVault.applyADLResolution(1); // Cannot resolve when uncovered debt is 0

        // Zero amount reverts
        vm.prank(engine);
        vm.expectRevert();
        marginVault.applyADLResolution(0);
    }

    // 4. Comprehensive Loss-Conservation Invariant Test
    function testLossConservationInvariantAcrossComplexLifecycle() public {
        address engine = address(0xEEEE);
        vm.prank(EXECUTOR);
        marginVault.setEngine(engine);

        // Phase 1: Initial Deposit $30,000 ($10,000 local, $20,000 allocated)
        vm.prank(LP1);
        lpVault.deposit(30_000_000_000);
        vm.prank(CONTROLLER);
        lpVault.allocateToMarginVault(20_000_000_000);

        require(lpVault.navAssets() == 30_000_000_000, "Phase 1: NAV");
        require(lpVault.sharePriceWad() == 1.0e18, "Phase 1: share price");

        // Phase 2: Independent loss #1 -> Trader profit $4,000
        vm.prank(engine);
        marginVault.setPendingPositivePnl(4_000_000_000);
        require(lpVault.navAssets() == 26_000_000_000, "Phase 2: Loss 1 recognized");

        // Phase 3: Independent loss #2 -> Liquidation bad debt $2,000
        vm.prank(engine);
        marginVault.settlePosition(address(0x888), 0, -2_000_000_000);
        require(lpVault.navAssets() == 24_000_000_000, "Phase 3: Loss 1 + Loss 2 recognized");

        // Phase 4: Independent loss #3 -> Additional liquidation bad debt $3,000
        vm.prank(engine);
        marginVault.settlePosition(address(0x777), 0, -3_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 5_000_000_000, "Phase 4: total bad debt 5k");
        require(lpVault.navAssets() == 21_000_000_000, "Phase 4: Loss 1 + Loss 2 + Loss 3 recognized");

        // Phase 5: Partial insurance recovery ($2,000 cash paid into margin vault)
        usdc.mint(address(marginVault), 2_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(2_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 3_000_000_000, "Phase 5: bad debt reduced to 3k");
        require(lpVault.navAssets() == 25_000_000_000, "Phase 5: NAV recovered to 25k");

        // Phase 6: Partial ADL resolution ($2,000 haircut)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(2_000_000_000); // 2k haircut from 4k
        vm.prank(engine);
        marginVault.applyADLResolution(2_000_000_000); // 2k bad debt reduced
        require(marginVault.cumulativeUncoveredBadDebt() == 1_000_000_000, "Phase 6: bad debt reduced to 1k");
        require(marginVault.pendingPositivePnl() == 2_000_000_000, "Phase 6: PnL reduced to 2k");
        require(lpVault.navAssets() == 29_000_000_000, "Phase 6: NAV recovered to 29k");

        // Phase 7: Full insurance recovery of remaining $1,000 bad debt
        usdc.mint(address(marginVault), 1_000_000_000);
        vm.prank(engine);
        marginVault.receiveInsuranceCoverage(1_000_000_000);
        require(marginVault.cumulativeUncoveredBadDebt() == 0, "Phase 7: bad debt cleared to 0");
        require(lpVault.navAssets() == 30_000_000_000, "Phase 7: NAV recovered to 30k par");

        // Phase 8: Profitable trader settles and withdraws free collateral
        address winningTrader = address(0x555);
        usdc.mint(winningTrader, 1_000_000);
        vm.prank(engine);
        marginVault.setPendingPositivePnl(0);
        // Settle profit directly into free collateral
        vm.prank(engine);
        marginVault.settlePosition(winningTrader, 0, 2_000_000_000);
        require(marginVault.freeCollateral(winningTrader) == 2_000_000_000, "Phase 8: free collateral credited");
        // Winning trader withdraws their $2,000 profit
        vm.prank(winningTrader);
        marginVault.withdraw(2_000_000_000);
        require(lpVault.navAssets() == 30_000_000_000, "Phase 8: NAV unchanged after trader withdrawal");

        // Phase 9: LP requests and executes withdrawal
        // Total shares = 30k, NAV = 30k. Share price = 1.0
        vm.prank(LP1);
        lpVault.requestWithdraw(3_000_000_000); // Request 3,000 shares
        vm.warp(vm.getBlockTimestamp() + 86401);
        uint256 lp1UsdcBefore = usdc.balanceOf(LP1);
        vm.prank(LP1);
        uint256 withdrawnUsdc = lpVault.claimWithdraw();
        // 3,000 shares * 30,000 / 30,000 = 3,000 USDC
        require(withdrawnUsdc == 3_000_000_000, "Phase 9: exact payout");
        require(usdc.balanceOf(LP1) - lp1UsdcBefore == 3_000_000_000, "Phase 9: physical cash received");
        require(lpVault.navAssets() == 27_000_000_000, "Phase 9: remaining NAV (30k - 3k)");
        require(lpVault.totalShares() == 27_000_000_000, "Phase 9: remaining shares (30k - 3k)");
        require(lpVault.sharePriceWad() == 1.0e18, "Phase 9: share price preserved at 1.0");

        // Phase 10: Margin equity below senior trader liabilities (catastrophic deficit)
        // Trader locks 30k collateral (creating senior liability exceeding margin cash)
        vm.prank(engine);
        marginVault.setPendingPositivePnl(30_000_000_000);
        // Margin net equity collapses to 0
        require(lpVault.navAssets() == 7_000_000_000, "Phase 10: local liquid cash preserved (7k), allocated wiped");
    }
}
