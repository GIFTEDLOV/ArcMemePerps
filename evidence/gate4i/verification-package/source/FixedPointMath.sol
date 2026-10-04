// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library FixedPointMath {
    uint256 internal constant USDC_SCALE = 1e6;
    uint256 internal constant WAD = 1e18;
    uint256 private constant INT256_MAX_U = (1 << 255) - 1;
    uint256 private constant INT256_MIN_MAGNITUDE = 1 << 255;

    error DivisionByZero();
    error SignedOverflow();

    function mulDivDown(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        if (denominator == 0) revert DivisionByZero();
        return (a * b) / denominator;
    }

    function mulDivUp(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        if (denominator == 0) revert DivisionByZero();
        if (a == 0 || b == 0) return 0;
        return ((a * b) - 1) / denominator + 1;
    }

    function usdcToUsdWad(uint256 usdc) internal pure returns (uint256) {
        return mulDivDown(usdc, WAD, USDC_SCALE);
    }

    function usdWadToUsdcDown(uint256 usdWad) internal pure returns (uint256) {
        return usdWad / (WAD / USDC_SCALE);
    }

    function usdWadToUsdcUp(uint256 usdWad) internal pure returns (uint256) {
        return (usdWad + (WAD / USDC_SCALE) - 1) / (WAD / USDC_SCALE);
    }

    function signedMulDiv(int256 a, uint256 b, uint256 denominator) internal pure returns (int256) {
        if (denominator == 0) revert DivisionByZero();
        if (a == 0 || b == 0) return 0;
        uint256 magnitude;
        if (a < 0) {
            if (a == type(int256).min) {
                magnitude = INT256_MIN_MAGNITUDE;
            } else {
                // a is negative and not int256.min; its magnitude is representable.
                // forge-lint: disable-next-line(unsafe-typecast)
                magnitude = uint256(-a);
            }
        } else {
            // a is non-negative and therefore representable as uint256.
            // forge-lint: disable-next-line(unsafe-typecast)
            magnitude = uint256(a);
        }
        uint256 quotient = mulDivDown(magnitude, b, denominator);
        if (a < 0) {
            if (quotient > INT256_MIN_MAGNITUDE) revert SignedOverflow();
            if (quotient == INT256_MIN_MAGNITUDE) return type(int256).min;
            // quotient is strictly less than 2^255 here.
            // forge-lint: disable-next-line(unsafe-typecast)
            return -int256(quotient);
        }
        if (quotient > INT256_MAX_U) revert SignedOverflow();
        // quotient is bounded by int256.max above.
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(quotient);
    }

    function directionalPnl(
        bool isLong,
        uint256 sizeUsdWad,
        uint256 entryPriceWad,
        uint256 exitPriceWad
    ) internal pure returns (int256) {
        if (entryPriceWad == 0 || exitPriceWad == 0) revert DivisionByZero();
        int256 priceDelta = isLong
            ? _toInt256(exitPriceWad) - _toInt256(entryPriceWad)
            : _toInt256(entryPriceWad) - _toInt256(exitPriceWad);
        return signedMulDiv(priceDelta, sizeUsdWad, entryPriceWad);
    }

    function _toInt256(uint256 value) private pure returns (int256) {
        if (value > INT256_MAX_U) revert SignedOverflow();
        // The range check above proves that this conversion cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(value);
    }
}
