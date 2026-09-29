// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IQualificationRegistry} from "./interfaces/IQualificationRegistry.sol";

contract QualificationRegistry is AccessControlled, IQualificationRegistry {
    mapping(bytes32 marketId => Qualification qualification) private _qualifications;

    error InvalidProof();
    error InvalidLimits();

    event QualificationApproved(
        bytes32 indexed marketId,
        bytes32 indexed proofHash,
        bytes32 indexed ruleVersion,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint64 expiresAt
    );
    event QualificationRevoked(bytes32 indexed marketId, bytes32 indexed proofHash);

    function approveQualification(
        bytes32 marketId,
        bytes32 proofHash,
        bytes32 ruleVersion,
        uint256 maxLeverage,
        uint256 maxOI,
        uint256 maxPosition,
        uint64 expiresAt
    ) external onlyOwner {
        if (proofHash == bytes32(0) || ruleVersion == bytes32(0)) revert InvalidProof();
        if (maxLeverage == 0 || maxOI == 0 || maxPosition == 0 || maxPosition > maxOI) {
            revert InvalidLimits();
        }
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidProof();
        _qualifications[marketId] = Qualification({
            proofHash: proofHash,
            ruleVersion: ruleVersion,
            qualifiedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            maxLeverage: maxLeverage,
            maxOI: maxOI,
            maxPosition: maxPosition,
            approved: true
        });
        emit QualificationApproved(
            marketId, proofHash, ruleVersion, maxLeverage, maxOI, maxPosition, expiresAt
        );
    }

    function revokeQualification(bytes32 marketId) external onlyOwner {
        Qualification storage qualification = _qualifications[marketId];
        qualification.approved = false;
        emit QualificationRevoked(marketId, qualification.proofHash);
    }

    function isApproved(bytes32 marketId) external view returns (bool) {
        Qualification memory qualification = _qualifications[marketId];
        return qualification.approved
            && (qualification.expiresAt == 0 || block.timestamp < qualification.expiresAt);
    }

    function getQualification(bytes32 marketId)
        external
        view
        returns (Qualification memory)
    {
        return _qualifications[marketId];
    }
}
