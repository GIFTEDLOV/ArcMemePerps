// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPublicLPVault {
    function recordFeeRevenue(uint256 feeAmount) external;
    function depositFeeRevenue(uint256 feeAmount) external;
    function navAssets() external view returns (uint256);
}
