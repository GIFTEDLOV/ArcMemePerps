// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SafeCast {
    uint256 private constant INT256_MAX = (1 << 255) - 1;
    error Uint64Overflow(uint256 value);
    error Int256ToUintOverflow(int256 value);
    error Uint256ToIntOverflow(uint256 value);
    error ExpectedNegative(int256 value);

    function toUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) revert Uint64Overflow(value);
        // The range check above proves that this conversion cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }

    function toUint256(int256 value) internal pure returns (uint256) {
        if (value < 0) revert Int256ToUintOverflow(value);
        // The sign check above proves that this conversion cannot wrap.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(value);
    }

    function toInt256(uint256 value) internal pure returns (int256) {
        if (value > INT256_MAX) revert Uint256ToIntOverflow(value);
        // The range check above proves that this conversion cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(value);
    }

    function magnitude(int256 value) internal pure returns (uint256) {
        if (value >= 0) revert ExpectedNegative(value);
        if (value == type(int256).min) return 1 << 255;
        // value is negative and not int256.min, so its magnitude is representable.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(-value);
    }
}
