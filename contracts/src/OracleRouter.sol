// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IOracleRouter } from "./interfaces/IOracleRouter.sol";
import { SafeCast } from "./SafeCast.sol";

/**
 * Arc execution oracle boundary.
 *
 * `setPrice` is retained as a deterministic Gate 1 compatibility hook and creates a
 * zero-width conservative band. Production execution is expected to use `setReport` from
 * a configured reporter-set verifier. Signature threshold verification is implemented in
 * the offchain oracle package and the contract-facing typed report is versioned here.
 */
contract OracleRouter is AccessControlled, IOracleRouter {
    struct Price {
        uint256 price;
        uint64 observedAt;
        uint256 confidenceBps;
    }

    struct StoredReport {
        OracleReport report;
        bool exists;
    }

    mapping(bytes32 marketId => Price price) private _prices;
    mapping(bytes32 marketId => StoredReport report) private _reports;
    mapping(address updater => bool enabled) public isUpdater;
    mapping(address reporter => bool enabled) public isReporter;
    mapping(bytes32 marketId => uint64 sequence) public latestSequence;
    uint64 public maxStaleness;
    uint256 public minimumConfidenceBps;
    uint256 public minimumIndependentSources;
    uint256 public immutable domainChainId;
    uint256 public reporterThreshold;
    bytes32 public reporterSetVersion;

    error InvalidPrice();
    error InvalidConfidence();
    error UnauthorizedUpdater();
    error StalePrice();
    error InvalidObservedAt();
    error InvalidValidityWindow();
    error LowConfidence();
    error InsufficientIndependentSources();
    error NonMonotonicSequence();
    error InvalidReportBand();
    error InvalidReporterSet();
    error InvalidSignature();
    error DuplicateSigner();
    error UnauthorizedReporter();
    error InsufficientReporterThreshold();
    error ReporterSetVersionMismatch();

    event UpdaterSet(address indexed updater, bool enabled);
    event UpdaterAuthorizationChanged(address indexed updater, bool enabled);
    event ReporterSet(address indexed reporter, bool enabled);
    event ReporterThresholdSet(uint256 threshold, bytes32 indexed version);
    event PriceUpdated(
        bytes32 indexed marketId, uint256 price, uint64 observedAt, uint256 confidenceBps
    );
    event ReportUpdated(bytes32 indexed marketId, uint64 indexed sequence);
    event OraclePolicyUpdated(
        uint64 maxStaleness, uint256 minimumConfidenceBps, uint256 minimumIndependentSources
    );

    constructor(uint64 maxStaleness_, uint256 minimumConfidenceBps_) {
        if (maxStaleness_ == 0 || minimumConfidenceBps_ > 10_000) revert InvalidConfidence();
        maxStaleness = maxStaleness_;
        minimumConfidenceBps = minimumConfidenceBps_;
        domainChainId = block.chainid;
    }

    function setUpdater(address updater, bool enabled) external onlyOwner {
        if (updater == address(0)) revert ZeroAddress();
        // The dedicated authorization event is emitted below for audit consumers.
        // forge-lint: disable-next-line(missing-events-access-control)
        isUpdater[updater] = enabled;
        emit UpdaterSet(updater, enabled);
        emit UpdaterAuthorizationChanged(updater, enabled);
    }

    function setReporter(address reporter, bool enabled) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        isReporter[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    function setReporterThreshold(uint256 threshold, bytes32 version) external onlyOwner {
        if (threshold == 0 || version == bytes32(0)) revert InvalidReporterSet();
        reporterThreshold = threshold;
        reporterSetVersion = version;
        emit ReporterThresholdSet(threshold, version);
    }

    function setPolicy(
        uint64 maxStaleness_,
        uint256 minimumConfidenceBps_,
        uint256 minimumIndependentSources_
    ) external onlyOwner {
        if (maxStaleness_ == 0 || minimumConfidenceBps_ > 10_000) {
            revert InvalidConfidence();
        }
        maxStaleness = maxStaleness_;
        minimumConfidenceBps = minimumConfidenceBps_;
        minimumIndependentSources = minimumIndependentSources_;
        emit OraclePolicyUpdated(maxStaleness_, minimumConfidenceBps_, minimumIndependentSources_);
    }

    function setPrice(bytes32 marketId, uint256 price, uint64 observedAt, uint256 confidenceBps)
        external
    {
        if (!isUpdater[msg.sender]) revert UnauthorizedUpdater();
        if (price == 0) revert InvalidPrice();
        if (confidenceBps > 10_000) revert InvalidConfidence();
        uint256 currentTime = _clock();
        // forge-lint: disable-next-line(block-timestamp)
        if (uint256(observedAt) > currentTime) revert InvalidObservedAt();
        _prices[marketId] = Price(price, observedAt, confidenceBps);
        OracleReport memory report = OracleReport({
            marketId: marketId,
            arcChainId: domainChainId,
            midPrice: price,
            minPrice: price,
            maxPrice: price,
            confidenceBps: confidenceBps,
            sourceCount: 1,
            independentSourceCount: 1,
            observedAt: observedAt,
            validFrom: observedAt,
            expiresAt: SafeCast.toUint64(currentTime + maxStaleness),
            sequence: latestSequence[marketId] + 1,
            evidenceRoot: bytes32(0),
            reporterSetVersion: bytes32(0)
        });
        _reports[marketId] = StoredReport(report, true);
        latestSequence[marketId] = report.sequence;
        emit PriceUpdated(marketId, price, observedAt, confidenceBps);
    }

    function setReport(OracleReport calldata report) external {
        if (!isUpdater[msg.sender]) revert UnauthorizedUpdater();
        _validateReport(report);
        uint64 previousSequence = latestSequence[report.marketId];
        if (report.sequence <= previousSequence) revert NonMonotonicSequence();
        _emitReportUpdated(report);
        _storeReport(report);
    }

    function setSignedReport(OracleReport calldata report, bytes[] calldata signatures) external {
        if (reporterThreshold == 0 || report.reporterSetVersion != reporterSetVersion) {
            revert ReporterSetVersionMismatch();
        }
        bytes32 digest = _reportDigest(report);
        address[] memory signers = new address[](signatures.length);
        uint256 validSigners = 0;
        for (uint256 index = 0; index < signatures.length; index++) {
            // Signature parsing is fail-closed; malformed data must abort the whole batch.
            // forge-lint: disable-next-line(require-revert-in-loop)
            address signer = _recover(digest, signatures[index]);
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (!isReporter[signer]) revert UnauthorizedReporter();
            for (uint256 previous = 0; previous < validSigners; previous++) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (signers[previous] == signer) revert DuplicateSigner();
            }
            signers[validSigners] = signer;
            validSigners++;
        }
        if (validSigners < reporterThreshold) revert InsufficientReporterThreshold();
        _validateReport(report);
        if (report.sequence <= latestSequence[report.marketId]) revert NonMonotonicSequence();
        _emitReportUpdated(report);
        _storeReport(report);
    }

    function getPrice(bytes32 marketId) external view returns (Price memory) {
        return _prices[marketId];
    }

    function getReport(bytes32 marketId) external view returns (OracleReport memory) {
        return _reports[marketId].report;
    }

    function getUsablePrice(bytes32 marketId)
        external
        view
        returns (uint256 price, uint64 observedAt, uint256 confidenceBps)
    {
        OracleReport memory report = _usableReport(marketId);
        return (report.midPrice, report.observedAt, report.confidenceBps);
    }

    function getExecutionPrice(bytes32 marketId, bool isLong, bool isOpening)
        external
        view
        returns (uint256 price)
    {
        OracleReport memory report = _usableReport(marketId);
        if (isLong == isOpening) return report.maxPrice;
        return report.minPrice;
    }

    function isReportUsable(bytes32 marketId) external view returns (bool) {
        try this.getUsablePrice(marketId) returns (uint256, uint64, uint256) {
            return true;
        } catch {
            return false;
        }
    }

    function _usableReport(bytes32 marketId) private view returns (OracleReport memory report) {
        StoredReport memory stored = _reports[marketId];
        if (!stored.exists || stored.report.midPrice == 0) revert InvalidPrice();
        report = stored.report;
        uint256 currentTime = _clock();
        // forge-lint: disable-next-line(block-timestamp)
        if (uint256(report.observedAt) > currentTime) revert InvalidObservedAt();
        // forge-lint: disable-next-line(block-timestamp)
        if (currentTime - uint256(report.observedAt) > maxStaleness) revert StalePrice();
        // forge-lint: disable-next-line(block-timestamp)
        if (report.validFrom > currentTime || report.expiresAt < currentTime) {
            revert StalePrice();
        }
        if (report.confidenceBps < minimumConfidenceBps) revert LowConfidence();
        if (report.independentSourceCount < minimumIndependentSources) {
            revert InsufficientIndependentSources();
        }
    }

    function _validateReport(OracleReport calldata report) private view {
        if (
            report.marketId == bytes32(0) || report.midPrice == 0 || report.minPrice == 0
                || report.maxPrice == 0 || report.minPrice > report.midPrice
                || report.midPrice > report.maxPrice
        ) revert InvalidReportBand();
        if (report.arcChainId != domainChainId) revert InvalidReportBand();
        if (report.confidenceBps > 10_000) revert InvalidConfidence();
        uint256 currentTime = _clock();
        // forge-lint: disable-next-line(block-timestamp)
        if (uint256(report.observedAt) > currentTime || uint256(report.validFrom) > currentTime) {
            revert InvalidObservedAt();
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (report.expiresAt <= report.validFrom || report.expiresAt > currentTime + maxStaleness) {
            revert InvalidValidityWindow();
        }
    }

    function _clock() private view returns (uint256) {
        // Freshness and bounded validity are intentionally timestamp based. The accepted
        // window is short and stale reports fail closed; timestamp drift cannot make a report
        // valid beyond its expiry.
        return block.timestamp;
    }

    function _storeReport(OracleReport calldata report) private {
        _reports[report.marketId] = StoredReport(report, true);
        _prices[report.marketId] = Price(report.midPrice, report.observedAt, report.confidenceBps);
        latestSequence[report.marketId] = report.sequence;
    }

    function _emitReportUpdated(OracleReport calldata report) private {
        // This helper performs no external call; callers emit only after validation.
        // forge-lint: disable-next-line(reentrancy-events)
        emit ReportUpdated(report.marketId, report.sequence);
    }

    bytes32 private constant _EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant _REPORT_TYPEHASH = keccak256(
        "CompositePriceReport(uint256 arcChainId,address oracleRouter,bytes32 marketId,uint256 midPriceWad,uint256 minPriceWad,uint256 maxPriceWad,uint256 confidenceBps,uint256 sourceCount,uint256 independentSourceCount,uint256 observedAt,uint256 validFrom,uint256 expiresAt,uint256 sequence,bytes32 evidenceRoot,bytes32 reporterSetVersion)"
    );

    function _reportDigest(OracleReport calldata report) private view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("ArcMemePerps Oracle")),
                keccak256(bytes("1")),
                domainChainId,
                address(this)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                _REPORT_TYPEHASH,
                report.arcChainId,
                address(this),
                report.marketId,
                report.midPrice,
                report.minPrice,
                report.maxPrice,
                report.confidenceBps,
                report.sourceCount,
                report.independentSourceCount,
                report.observedAt,
                report.validFrom,
                report.expiresAt,
                report.sequence,
                report.evidenceRoot,
                report.reporterSetVersion
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature)
        private
        pure
        returns (address signer)
    {
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            // forge-lint: disable-next-line(require-revert-in-loop)
            revert InvalidSignature();
        }
        signer = ecrecover(digest, v, r, s);
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (signer == address(0)) revert InvalidSignature();
    }
}
