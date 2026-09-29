// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleRouter {
    function getUsablePrice(bytes32 marketId)
        external
        view
        returns (uint256 price, uint64 observedAt, uint256 confidenceBps);
}
