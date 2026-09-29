// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IOracleRouter} from "./interfaces/IOracleRouter.sol";

contract OracleRouter is AccessControlled, IOracleRouter {
    struct Price {
        uint256 price;
        uint64 observedAt;
        uint256 confidenceBps;
    }

    mapping(bytes32 marketId => Price price) private _prices;
    mapping(address updater => bool enabled) public isUpdater;
    uint64 public maxStaleness;
    uint256 public minimumConfidenceBps;

    error InvalidPrice();
    error InvalidConfidence();
    error UnauthorizedUpdater();
    error StalePrice();
    error InvalidObservedAt();
    error LowConfidence();

    event UpdaterSet(address indexed updater, bool enabled);
    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint64 observedAt, uint256 confidenceBps);
    event OraclePolicyUpdated(uint64 maxStaleness, uint256 minimumConfidenceBps);

    constructor(uint64 maxStaleness_, uint256 minimumConfidenceBps_) {
        if (maxStaleness_ == 0 || minimumConfidenceBps_ > 10_000) revert InvalidConfidence();
        maxStaleness = maxStaleness_;
        minimumConfidenceBps = minimumConfidenceBps_;
    }

    function setUpdater(address updater, bool enabled) external onlyOwner {
        if (updater == address(0)) revert ZeroAddress();
        isUpdater[updater] = enabled;
        emit UpdaterSet(updater, enabled);
    }

    function setPolicy(uint64 maxStaleness_, uint256 minimumConfidenceBps_) external onlyOwner {
        if (maxStaleness_ == 0 || minimumConfidenceBps_ > 10_000) revert InvalidConfidence();
        maxStaleness = maxStaleness_;
        minimumConfidenceBps = minimumConfidenceBps_;
        emit OraclePolicyUpdated(maxStaleness_, minimumConfidenceBps_);
    }

    function setPrice(bytes32 marketId, uint256 price, uint64 observedAt, uint256 confidenceBps)
        external
    {
        if (!isUpdater[msg.sender]) revert UnauthorizedUpdater();
        if (price == 0) revert InvalidPrice();
        if (confidenceBps > 10_000) revert InvalidConfidence();
        if (observedAt > block.timestamp) revert InvalidObservedAt();
        _prices[marketId] = Price(price, observedAt, confidenceBps);
        emit PriceUpdated(marketId, price, observedAt, confidenceBps);
    }

    function getPrice(bytes32 marketId) external view returns (Price memory) {
        return _prices[marketId];
    }

    function getUsablePrice(bytes32 marketId)
        external
        view
        returns (uint256 price, uint64 observedAt, uint256 confidenceBps)
    {
        Price memory current = _prices[marketId];
        if (current.price == 0) revert InvalidPrice();
        if (current.observedAt > block.timestamp || block.timestamp - current.observedAt > maxStaleness) {
            revert StalePrice();
        }
        if (current.confidenceBps < minimumConfidenceBps) revert LowConfidence();
        return (current.price, current.observedAt, current.confidenceBps);
    }
}
