// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IExposureProvider} from "./interfaces/IExposureProvider.sol";
import {IQualificationRegistry} from "./interfaces/IQualificationRegistry.sol";
import {IRiskConfig} from "./interfaces/IRiskConfig.sol";

contract RiskConfig is AccessControlled, IRiskConfig {
    enum MarketStatus {
        BLOCKED,
        PAUSED,
        CLOSE_ONLY,
        LIVE
    }

    IQualificationRegistry public immutable qualificationRegistry;
    address public exposureProvider;
    mapping(bytes32 marketId => Config config) private _configs;

    error ConfigMissing();
    error InvalidLimits();
    error QualificationMissing();
    error RiskIncreaseNotAllowed();

    event RiskConfigInitialized(bytes32 indexed marketId, Config config);
    event RiskLimitsReduced(bytes32 indexed marketId, Config config);
    event MarketStatusUpdated(bytes32 indexed marketId, MarketStatus status);
    event ExposureProviderSet(address indexed exposureProvider);

    constructor(address qualificationRegistry_) {
        if (qualificationRegistry_ == address(0)) revert ZeroAddress();
        qualificationRegistry = IQualificationRegistry(qualificationRegistry_);
    }

    function setExposureProvider(address exposureProvider_) external onlyOwner {
        if (exposureProvider_ == address(0)) revert ZeroAddress();
        exposureProvider = exposureProvider_;
        emit ExposureProviderSet(exposureProvider_);
    }

    function initializeConfig(
        bytes32 marketId,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint256 maintenanceMarginBps,
        uint256 liquidationPenaltyBps
    ) external onlyOwner {
        if (_configs[marketId].maxOI != 0) revert InvalidLimits();
        _validateLimits(maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps);
        _configs[marketId] = Config({
            maxLeverage: maxLeverage,
            maxOI: maxOI,
            maxPosition: maxPosition,
            maintenanceMarginBps: maintenanceMarginBps,
            liquidationPenaltyBps: liquidationPenaltyBps,
            status: uint8(MarketStatus.BLOCKED)
        });
        emit RiskConfigInitialized(marketId, _configs[marketId]);
    }

    function reduceRiskLimits(
        bytes32 marketId,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint256 maintenanceMarginBps,
        uint256 liquidationPenaltyBps
    ) external onlyOwner {
        Config storage current = _configs[marketId];
        if (current.maxOI == 0) revert ConfigMissing();
        if (maxLeverage > current.maxLeverage || maxOI > current.maxOI || maxPosition > current.maxPosition) {
            revert RiskIncreaseNotAllowed();
        }
        if (maintenanceMarginBps < current.maintenanceMarginBps) revert RiskIncreaseNotAllowed();
        if (liquidationPenaltyBps > current.liquidationPenaltyBps) revert RiskIncreaseNotAllowed();
        if (exposureProvider != address(0)) {
            uint256 currentOpenInterest = IExposureProvider(exposureProvider).totalOpenInterest(marketId);
            // A cap cannot be reduced below existing exposure. Existing positions must de-risk first.
            if (maxOI < currentOpenInterest || maxPosition < currentOpenInterest) {
                revert RiskIncreaseNotAllowed();
            }
        }
        _validateLimits(maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps);
        current.maxLeverage = maxLeverage;
        current.maxOI = maxOI;
        current.maxPosition = maxPosition;
        current.maintenanceMarginBps = maintenanceMarginBps;
        current.liquidationPenaltyBps = liquidationPenaltyBps;
        emit RiskLimitsReduced(marketId, current);
    }

    function setStatus(bytes32 marketId, MarketStatus status) external onlyOwner {
        Config storage current = _configs[marketId];
        if (current.maxOI == 0) revert ConfigMissing();
        if (status == MarketStatus.LIVE && !qualificationRegistry.isApproved(marketId)) {
            revert QualificationMissing();
        }
        current.status = uint8(status);
        emit MarketStatusUpdated(marketId, status);
    }

    function canIncreaseExposure(bytes32 marketId) external view returns (bool) {
        Config memory config = _configs[marketId];
        return config.maxOI != 0 && config.status == uint8(MarketStatus.LIVE);
    }

    function getConfig(bytes32 marketId) external view returns (Config memory) {
        if (_configs[marketId].maxOI == 0) revert ConfigMissing();
        return _configs[marketId];
    }

    function _validateLimits(
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint256 maintenanceMarginBps,
        uint256 liquidationPenaltyBps
    ) private pure {
        if (
            maxLeverage == 0 || maxOI == 0 || maxPosition == 0 || maxPosition > maxOI
                || maintenanceMarginBps > 10_000 || liquidationPenaltyBps > 10_000
        ) revert InvalidLimits();
    }
}
