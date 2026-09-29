// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IOracleRouter } from "../src/interfaces/IOracleRouter.sol";
import { OracleRouter } from "../src/OracleRouter.sol";

interface VmOracle {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function expectRevert() external;
}

contract OracleSignatureTest {
    VmOracle private constant vm =
        VmOracle(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant REPORTER_KEY = 0xA11CE;
    uint256 private constant OTHER_KEY = 0xB0B;

    function testThresholdReportRejectsReplayAndAcceptsValidSignature() public {
        OracleRouter router = new OracleRouter(120, 8_500);
        address reporter = vm.addr(REPORTER_KEY);
        router.setReporter(reporter, true);
        router.setReporterThreshold(1, keccak256("reporters-v1"));
        IOracleRouter.OracleReport memory report = _report(router, 1, 1e18);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signature(REPORTER_KEY, _digest(router, report));
        router.setSignedReport(report, signatures);
        require(router.latestSequence(report.marketId) == 1);
        vm.expectRevert();
        router.setSignedReport(report, signatures);
    }

    function testDuplicateUnauthorizedAndTamperedReportsReject() public {
        OracleRouter router = new OracleRouter(120, 8_500);
        address reporter = vm.addr(REPORTER_KEY);
        router.setReporter(reporter, true);
        router.setReporterThreshold(2, keccak256("reporters-v1"));
        IOracleRouter.OracleReport memory report = _report(router, 1, 1e18);
        bytes memory signature = _signature(REPORTER_KEY, _digest(router, report));
        bytes[] memory duplicate = new bytes[](2);
        duplicate[0] = signature;
        duplicate[1] = signature;
        vm.expectRevert();
        router.setSignedReport(report, duplicate);

        IOracleRouter.OracleReport memory tampered = _report(router, 2, 2e18);
        bytes[] memory unauthorized = new bytes[](1);
        unauthorized[0] = _signature(OTHER_KEY, _digest(router, tampered));
        vm.expectRevert();
        router.setSignedReport(tampered, unauthorized);
    }

    function _report(OracleRouter router, uint64 sequence, uint256 price)
        private
        view
        returns (IOracleRouter.OracleReport memory)
    {
        uint64 now64 = uint64(block.timestamp);
        return IOracleRouter.OracleReport({
            marketId: bytes32(uint256(1)),
            arcChainId: router.domainChainId(),
            midPrice: price,
            minPrice: price - 1,
            maxPrice: price + 1,
            confidenceBps: 9_500,
            sourceCount: 2,
            independentSourceCount: 2,
            observedAt: now64,
            validFrom: now64,
            expiresAt: now64 + 60,
            sequence: sequence,
            evidenceRoot: bytes32(uint256(2)),
            reporterSetVersion: keccak256("reporters-v1")
        });
    }

    function _digest(OracleRouter router, IOracleRouter.OracleReport memory report)
        private
        view
        returns (bytes32)
    {
        bytes32 domainTypehash = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        bytes32 reportTypehash = keccak256(
            "CompositePriceReport(uint256 arcChainId,address oracleRouter,bytes32 marketId,uint256 midPriceWad,uint256 minPriceWad,uint256 maxPriceWad,uint256 confidenceBps,uint256 sourceCount,uint256 independentSourceCount,uint256 observedAt,uint256 validFrom,uint256 expiresAt,uint256 sequence,bytes32 evidenceRoot,bytes32 reporterSetVersion)"
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                domainTypehash,
                keccak256(bytes("ArcMemePerps Oracle")),
                keccak256(bytes("1")),
                router.domainChainId(),
                address(router)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                reportTypehash,
                report.arcChainId,
                address(router),
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

    function _signature(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
