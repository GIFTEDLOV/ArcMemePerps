// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SafeCast {
    error Uint64Overflow(uint256 value);
    error Int256ToUintOverflow(int256 value);

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
}
