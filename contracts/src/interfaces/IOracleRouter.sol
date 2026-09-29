// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleRouter {
    struct OracleReport {
        bytes32 marketId;
        uint256 arcChainId;
        uint256 midPrice;
        uint256 minPrice;
        uint256 maxPrice;
        uint256 confidenceBps;
        uint256 sourceCount;
        uint256 independentSourceCount;
        uint64 observedAt;
        uint64 validFrom;
        uint64 expiresAt;
        uint64 sequence;
        bytes32 evidenceRoot;
        bytes32 reporterSetVersion;
    }

    function getUsablePrice(bytes32 marketId)
        external
        view
        returns (uint256 price, uint64 observedAt, uint256 confidenceBps);

    function getExecutionPrice(bytes32 marketId, bool isLong, bool isOpening)
        external
        view
        returns (uint256 price);

    function isReportUsable(bytes32 marketId) external view returns (bool);

    function getReport(bytes32 marketId) external view returns (OracleReport memory);
}
