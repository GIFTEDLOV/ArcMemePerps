// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EconomicModel } from "../src/EconomicModel.sol";

contract EconomicMathHarness {
    function pnl(bool isLong, uint256 size, uint256 entry, uint256 exit)
        external
        pure
        returns (int256)
    {
        return EconomicModel.directionalPnl(isLong, size, entry, exit);
    }

    function fee(uint256 notional, uint256 rate) external pure returns (uint256) {
        return EconomicModel.positionFee(notional, rate);
    }

    function funding(
        uint256 longOi,
        uint256 shortOi,
        uint256 elapsed,
        EconomicModel.FundingConfig calldata config
    ) external pure returns (EconomicModel.FundingUpdate memory) {
        return EconomicModel.fundingUpdate(longOi, shortOi, elapsed, config);
    }

    function borrow(
        uint256 exposure,
        uint256 backing,
        uint256 elapsed,
        uint256 notional,
        EconomicModel.BorrowConfig calldata config
    ) external pure returns (uint256, uint256, uint256) {
        return EconomicModel.borrowFee(exposure, backing, elapsed, notional, config);
    }
}
