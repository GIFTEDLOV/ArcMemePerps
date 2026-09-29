// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IExposureProvider {
    function totalOpenInterest(bytes32 marketId) external view returns (uint256);
}
