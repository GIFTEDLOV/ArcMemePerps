// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRiskConfig {
    struct Config {
        uint256 maxLeverage;
        uint256 maxOI;
        uint256 maxPosition;
        uint256 maintenanceMarginBps;
        uint256 liquidationPenaltyBps;
        uint8 status;
    }

    function canIncreaseExposure(bytes32 marketId) external view returns (bool);

    function getConfig(bytes32 marketId) external view returns (Config memory);
}
