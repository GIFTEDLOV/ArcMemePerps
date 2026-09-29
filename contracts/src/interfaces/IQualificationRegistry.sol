// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IQualificationRegistry {
    struct Qualification {
        bytes32 proofHash;
        bytes32 ruleVersion;
        uint64 qualifiedAt;
        uint256 maxLeverage;
        uint256 maxOI;
        uint256 maxPosition;
        bool approved;
    }

    function isApproved(bytes32 marketId) external view returns (bool);

    function getQualification(bytes32 marketId) external view returns (Qualification memory);
}
