// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUSDCMarginVault {
    function lockCollateral(address trader, uint256 amount) external;

    function unlockCollateral(address trader, uint256 amount) external;

    function settlePosition(address trader, uint256 collateral, int256 pnl)
        external
        returns (uint256 badDebt);
}
