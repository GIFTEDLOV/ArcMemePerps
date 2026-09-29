// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EconomicModel } from "../src/EconomicModel.sol";

contract FundingInvariantHandler {
    uint256 public totalPaid;
    uint256 public totalReceived;
    uint256 public totalVaultRouted;
    uint256 public totalDust;
    uint256 public lastLongOi;
    uint256 public lastShortOi;

    function update(uint256 longOi, uint256 shortOi, uint256 elapsed) external {
        longOi %= 1_000_000_000_000_000_000_000_000;
        shortOi %= 1_000_000_000_000_000_000_000_000;
        elapsed %= 86_400;
        EconomicModel.FundingUpdate memory result = EconomicModel.fundingUpdate(
            longOi,
            shortOi,
            elapsed,
            EconomicModel.FundingConfig({
                factorPerSecondWad: 1_000_000_000_000,
                capPerSecondWad: 10_000_000_000_000,
                minimumDenominatorUsdWad: 1e18
            })
        );
        uint256 payer = result.longPaymentUsdWad > result.shortPaymentUsdWad
            ? result.longPaymentUsdWad
            : result.shortPaymentUsdWad;
        uint256 receiver = result.longPaymentUsdWad > result.shortPaymentUsdWad
            ? result.shortPaymentUsdWad
            : result.longPaymentUsdWad;
        totalPaid += payer;
        totalReceived += receiver;
        totalVaultRouted += result.vaultRoutedUsdWad;
        totalDust += result.roundingDustUsdWad;
        lastLongOi = longOi;
        lastShortOi = shortOi;
    }
}

contract Gate3InvariantsTest {
    FundingInvariantHandler private handler;

    function setUp() public {
        handler = new FundingInvariantHandler();
    }

    function invariant_FundingConservation() public view {
        require(
            handler.totalPaid()
                == handler.totalReceived() + handler.totalVaultRouted() + handler.totalDust()
        );
    }

    function invariant_FundingStateIsNonNegative() public view {
        require(handler.lastLongOi() >= 0 && handler.lastShortOi() >= 0);
    }
}
