// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FixedPointMath } from "./FixedPointMath.sol";

/**
 *  Pure V1 economic formulas. Configuration and governance live outside this library.
 */
library EconomicModel {
    uint256 internal constant BPS = 10_000;

    struct FundingConfig {
        uint256 factorPerSecondWad;
        uint256 capPerSecondWad;
        uint256 minimumDenominatorUsdWad;
    }

    struct FundingUpdate {
        uint256 imbalanceUsdWad;
        uint256 imbalanceRatioWad;
        uint256 ratePerSecondWad;
        int256 indexDeltaWad;
        uint256 longPaymentUsdWad;
        uint256 shortPaymentUsdWad;
        uint256 vaultRoutedUsdWad;
        uint256 roundingDustUsdWad;
    }

    struct BorrowConfig {
        uint256 baseRatePerSecondWad;
        uint256 slopePerSecondWad;
        uint256 kinkUtilizationWad;
        uint256 maxRatePerSecondWad;
    }

    function directionalPnl(
        bool isLong,
        uint256 sizeUsdWad,
        uint256 entryPriceWad,
        uint256 exitPriceWad
    ) internal pure returns (int256) {
        return FixedPointMath.directionalPnl(isLong, sizeUsdWad, entryPriceWad, exitPriceWad);
    }

    function positionFee(uint256 notionalUsdWad, uint256 feeRateWad)
        internal
        pure
        returns (uint256)
    {
        return FixedPointMath.mulDivUp(notionalUsdWad, feeRateWad, FixedPointMath.WAD);
    }

    function fundingUpdate(
        uint256 longOiUsdWad,
        uint256 shortOiUsdWad,
        uint256 elapsedSeconds,
        FundingConfig memory config
    ) internal pure returns (FundingUpdate memory update) {
        uint256 total = longOiUsdWad + shortOiUsdWad;
        bool longDominant = longOiUsdWad >= shortOiUsdWad;
        uint256 imbalance =
            longDominant ? longOiUsdWad - shortOiUsdWad : shortOiUsdWad - longOiUsdWad;
        uint256 denominator =
            total > config.minimumDenominatorUsdWad ? total : config.minimumDenominatorUsdWad;
        uint256 ratio = denominator == 0
            ? 0
            : FixedPointMath.mulDivDown(imbalance, FixedPointMath.WAD, denominator);
        uint256 uncapped =
            FixedPointMath.mulDivDown(config.factorPerSecondWad, ratio, FixedPointMath.WAD);
        uint256 rate = uncapped > config.capPerSecondWad ? config.capPerSecondWad : uncapped;
        uint256 indexDelta = rate * elapsedSeconds;
        uint256 payerOi = longDominant ? longOiUsdWad : shortOiUsdWad;
        uint256 opposingOi = longDominant ? shortOiUsdWad : longOiUsdWad;
        uint256 payer = FixedPointMath.mulDivDown(payerOi, indexDelta, FixedPointMath.WAD);
        uint256 receiver = FixedPointMath.mulDivDown(opposingOi, indexDelta, FixedPointMath.WAD);
        uint256 routed = payer > receiver ? payer - receiver : 0;
        if (indexDelta > (1 << 255) - 1) revert FixedPointMath.SignedOverflow();
        update.imbalanceUsdWad = imbalance;
        update.imbalanceRatioWad = ratio;
        update.ratePerSecondWad = rate;
        // The range check above proves the signed conversion cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        update.indexDeltaWad = longDominant ? int256(indexDelta) : -int256(indexDelta);
        update.longPaymentUsdWad = longDominant ? payer : receiver;
        update.shortPaymentUsdWad = longDominant ? receiver : payer;
        update.vaultRoutedUsdWad = routed;
        update.roundingDustUsdWad = payer - receiver - routed;
    }

    function borrowFee(
        uint256 riskExposureUsdWad,
        uint256 availableBackingUsdWad,
        uint256 elapsedSeconds,
        uint256 notionalUsdWad,
        BorrowConfig memory config
    ) internal pure returns (uint256 utilizationWad, uint256 indexDeltaWad, uint256 feeUsdWad) {
        if (availableBackingUsdWad == 0) revert FixedPointMath.DivisionByZero();
        utilizationWad = riskExposureUsdWad >= availableBackingUsdWad
            ? FixedPointMath.WAD
            : FixedPointMath.mulDivDown(
                riskExposureUsdWad, FixedPointMath.WAD, availableBackingUsdWad
            );
        uint256 rate;
        if (utilizationWad <= config.kinkUtilizationWad) {
            uint256 denominator = config.kinkUtilizationWad == 0 ? 1 : config.kinkUtilizationWad;
            rate = config.baseRatePerSecondWad
                + FixedPointMath.mulDivDown(config.slopePerSecondWad, utilizationWad, denominator);
        } else {
            rate = config.baseRatePerSecondWad + config.slopePerSecondWad;
        }
        if (rate > config.maxRatePerSecondWad) rate = config.maxRatePerSecondWad;
        indexDeltaWad = rate * elapsedSeconds;
        feeUsdWad = FixedPointMath.mulDivUp(notionalUsdWad, indexDeltaWad, FixedPointMath.WAD);
    }

    function skewFee(
        uint256 longOiUsdWad,
        uint256 shortOiUsdWad,
        bool isLong,
        uint256 sizeUsdWad,
        uint256 feeRateWad
    ) internal pure returns (uint256 feeUsdWad, bool worsensSkew, uint256 skewRatioWad) {
        uint256 total = longOiUsdWad + shortOiUsdWad;
        uint256 net = longOiUsdWad >= shortOiUsdWad
            ? longOiUsdWad - shortOiUsdWad
            : shortOiUsdWad - longOiUsdWad;
        skewRatioWad = total == 0 ? 0 : FixedPointMath.mulDivDown(net, FixedPointMath.WAD, total);
        worsensSkew = longOiUsdWad == shortOiUsdWad || (longOiUsdWad > shortOiUsdWad && isLong)
            || (shortOiUsdWad > longOiUsdWad && !isLong);
        feeUsdWad =
            worsensSkew ? FixedPointMath.mulDivUp(sizeUsdWad, feeRateWad, FixedPointMath.WAD) : 0;
    }
}
