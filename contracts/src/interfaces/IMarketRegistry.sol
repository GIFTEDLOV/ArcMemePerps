// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketRegistry {
    function canIncreaseExposure(bytes32 marketId) external view returns (bool);

    function canReduceExposure(bytes32 marketId) external view returns (bool);

    function marketExists(bytes32 marketId) external view returns (bool);

    function marketState(bytes32 marketId) external view returns (uint8);
}
