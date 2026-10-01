// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IExposureProvider } from "./interfaces/IExposureProvider.sol";
import { IQualificationRegistry } from "./interfaces/IQualificationRegistry.sol";
import { IRiskConfig } from "./interfaces/IRiskConfig.sol";

contract RiskConfig is AccessControlled, IRiskConfig {
    uint256 public constant GLOBAL_MAX_LEVERAGE = 5e18;
    enum MarketStatus {
        BLOCKED,
        PAUSED,
        CLOSE_ONLY,
        LIVE
    }

    IQualificationRegistry public immutable qualificationRegistry;
    address public exposureProvider;
    mapping(bytes32 marketId => Config config) private _configs;
    mapping(bytes32 marketId => bytes32 proofHash) public appliedQualificationProof;
    mapping(bytes32 marketId => uint64 assessedAt) public appliedQualificationAt;

    error ConfigMissing();
    error InvalidLimits();
    error QualificationMissing();
    error RiskIncreaseNotAllowed();

    event RiskConfigInitialized(bytes32 indexed marketId, Config config);
    event RiskLimitsReduced(bytes32 indexed marketId, Config config);
    event MarketRequalified(bytes32 indexed marketId, bytes32 indexed proofHash, Config config);
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
        _validateLimits(
            maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps
        );
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

    function emergencyReduceRiskLimits(
        bytes32 marketId,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint256 maintenanceMarginBps,
        uint256 liquidationPenaltyBps
    ) external onlyEmergencyAdmin {
        Config storage current = _configs[marketId];
        if (current.maxOI == 0) revert ConfigMissing();
        if (
            maxLeverage > current.maxLeverage || maxOI > current.maxOI
                || maxPosition > current.maxPosition
        ) {
            revert RiskIncreaseNotAllowed();
        }
        if (maintenanceMarginBps < current.maintenanceMarginBps) revert RiskIncreaseNotAllowed();
        if (liquidationPenaltyBps > current.liquidationPenaltyBps) revert RiskIncreaseNotAllowed();
        if (exposureProvider != address(0)) {
            uint256 currentOpenInterest =
                IExposureProvider(exposureProvider).totalOpenInterest(marketId);
            // A cap cannot be reduced below existing exposure. Existing positions must de-risk first.
            if (maxOI < currentOpenInterest || maxPosition < currentOpenInterest) {
                revert RiskIncreaseNotAllowed();
            }
        }
        _validateLimits(
            maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps
        );
        current.maxLeverage = maxLeverage;
        current.maxOI = maxOI;
        current.maxPosition = maxPosition;
        current.maintenanceMarginBps = maintenanceMarginBps;
        current.liquidationPenaltyBps = liquidationPenaltyBps;
        emit RiskLimitsReduced(marketId, current);
    }

    function emergencySetStatus(bytes32 marketId, MarketStatus status) external onlyEmergencyAdmin {
        Config storage current = _configs[marketId];
        if (current.maxOI == 0) revert ConfigMissing();
        if (status == MarketStatus.LIVE) revert QualificationMissing();
        current.status = uint8(status);
        emit MarketStatusUpdated(marketId, status);
    }

    function requalifyMarket(
        bytes32 marketId,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint256 maintenanceMarginBps,
        uint256 liquidationPenaltyBps
    ) external onlyOwner {
        Config storage current = _configs[marketId];
        if (current.maxOI == 0) revert ConfigMissing();
        if (!qualificationRegistry.isApproved(marketId)) revert QualificationMissing();
        IQualificationRegistry.Qualification memory qualification =
            qualificationRegistry.getQualification(marketId);
        if (
            qualification.proofHash == bytes32(0)
                || qualification.qualifiedAt <= appliedQualificationAt[marketId]
        ) {
            revert QualificationMissing();
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (qualification.expiresAt != 0 && _clock() >= qualification.expiresAt) {
            revert QualificationMissing();
        }
        if (
            maxLeverage > qualification.maxLeverage || maxOI > qualification.maxOI
                || maxPosition > qualification.maxPosition
        ) revert InvalidLimits();
        _validateLimits(
            maxLeverage, maxOI, maxPosition, maintenanceMarginBps, liquidationPenaltyBps
        );
        current.maxLeverage = maxLeverage;
        current.maxOI = maxOI;
        current.maxPosition = maxPosition;
        current.maintenanceMarginBps = maintenanceMarginBps;
        current.liquidationPenaltyBps = liquidationPenaltyBps;
        current.status = uint8(MarketStatus.LIVE);
        appliedQualificationProof[marketId] = qualification.proofHash;
        appliedQualificationAt[marketId] = qualification.qualifiedAt;
        emit MarketRequalified(marketId, qualification.proofHash, current);
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
            maxLeverage == 0 || maxLeverage > GLOBAL_MAX_LEVERAGE || maxOI == 0 || maxPosition == 0
                || maxPosition > maxOI || maintenanceMarginBps > 10_000
                || liquidationPenaltyBps > 10_000
        ) revert InvalidLimits();
    }

    function _clock() private view returns (uint256) {
        // Used only for bounded qualification expiry; a validator cannot extend a proof.
        return block.timestamp;
    }
}
