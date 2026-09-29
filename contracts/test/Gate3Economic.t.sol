// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EconomicModel } from "../src/EconomicModel.sol";
import { EconomicMathHarness } from "./EconomicMathHarness.sol";

contract Gate3EconomicTest {
    uint256 private constant WAD = 1e18;

    function testGoldenPnlVectors() public {
        EconomicMathHarness harness = new EconomicMathHarness();
        require(harness.pnl(true, 100 * WAD, WAD, 2 * WAD) == 100e18);
        require(harness.pnl(true, 100 * WAD, WAD, WAD / 2) == -50e18);
        require(harness.pnl(false, 100 * WAD, WAD, 2 * WAD) == -100e18);
        require(harness.pnl(false, 100 * WAD, WAD, WAD / 2) == 50e18);
        require(harness.pnl(true, WAD, 1_000_000, 2_000_000) == 1e18);
    }

    function testFeeRoundingFavorsProtocol() public {
        EconomicMathHarness harness = new EconomicMathHarness();
        require(harness.fee(1, 1) == 1);
        require(harness.fee(100 * WAD, 1e15) == 1e17);
    }

    function testFundingConservationVector() public {
        EconomicMathHarness harness = new EconomicMathHarness();
        EconomicModel.FundingUpdate memory update = harness.funding(
            80_000 * WAD,
            20_000 * WAD,
            3_600,
            EconomicModel.FundingConfig({
                factorPerSecondWad: 1_000_000_000_000,
                capPerSecondWad: 10_000_000_000_000,
                minimumDenominatorUsdWad: WAD
            })
        );
        require(update.indexDeltaWad == 2_160_000_000_000_000);
        require(update.longPaymentUsdWad == 172_800 * 1e15);
        require(update.shortPaymentUsdWad == 43_200 * 1e15);
        require(update.vaultRoutedUsdWad == 129_600 * 1e15);
        require(
            update.longPaymentUsdWad
                == update.shortPaymentUsdWad + update.vaultRoutedUsdWad + update.roundingDustUsdWad
        );
    }

    function testBorrowIndexIsBoundedAtHighUtilization() public {
        EconomicMathHarness harness = new EconomicMathHarness();
        (uint256 utilization, uint256 indexDelta, uint256 fee) = harness.borrow(
            2_000 * WAD,
            1_000 * WAD,
            3_600,
            500 * WAD,
            EconomicModel.BorrowConfig({
                baseRatePerSecondWad: 1_000_000_000,
                slopePerSecondWad: 2_000_000_000,
                kinkUtilizationWad: 8e17,
                maxRatePerSecondWad: 2_500_000_000
            })
        );
        require(utilization == WAD);
        require(indexDelta == 9_000_000_000_000);
        require(fee == 4_500_000_000_000_000);
    }

    function testFuzzPnlIsZeroAtEqualPrice(uint256 size, uint256 price) public {
        if (size > type(uint256).max / WAD || price == 0 || price > type(uint256).max / 2) return;
        EconomicMathHarness harness = new EconomicMathHarness();
        require(harness.pnl(true, size * WAD, price, price) == 0);
        require(harness.pnl(false, size * WAD, price, price) == 0);
    }
}
