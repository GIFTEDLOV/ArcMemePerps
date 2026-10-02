// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "../src/AccessControlled.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { OracleRouter } from "../src/OracleRouter.sol";
import { IOracleRouter } from "../src/interfaces/IOracleRouter.sol";
import { PublicLPVault } from "../src/PublicLPVault.sol";
import { QualificationRegistry } from "../src/QualificationRegistry.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmGate4FSecurity {
    function prank(address sender) external;
    function expectRevert() external;
}

contract SecurityTarget is AccessControlled {
    uint256 public value;

    function setValue(uint256 value_) external onlyGovernanceExecutor {
        value = value_;
    }
}

contract FeeOnTransferUsdc {
    uint8 public constant decimals = 6;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address account => mapping(address spender => uint256 amount)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) revert();
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount - 1;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool)
    {
        if (balanceOf[sender] < amount || allowance[sender][msg.sender] < amount) {
            revert();
        }
        allowance[sender][msg.sender] -= amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount - 1;
        return true;
    }
}

contract Gate4FSecurityTest {
    VmGate4FSecurity private constant vm =
        VmGate4FSecurity(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testBootstrapFinalizationRemovesDeployerRuntimeBypass() public {
        SecurityTarget target = new SecurityTarget();
        address executor = address(0xBEEF);
        target.setGovernanceExecutor(executor);
        target.setRole(target.GOVERNANCE_ADMIN_ROLE(), executor, true);
        target.finalizeBootstrap();
        bytes32 riskAdminRole = target.RISK_ADMIN_ROLE();

        vm.expectRevert();
        target.setValue(1);
        vm.expectRevert();
        target.setRole(riskAdminRole, address(0xCAFE), true);

        vm.prank(executor);
        target.setValue(2);
        require(target.value() == 2);
        require(!target.hasRole(target.GOVERNANCE_ADMIN_ROLE(), address(this)));
    }

    function testDedicatedRoleRemainsUsableAfterBootstrapFinalization() public {
        OracleRouter oracle = new OracleRouter(120, 8_500);
        address governance = address(0xB0B);
        address oracleAdmin = address(0xC0C);
        oracle.setGovernanceExecutor(governance);
        oracle.setRole(oracle.ORACLE_ADMIN_ROLE(), oracleAdmin, true);
        oracle.finalizeBootstrap();

        vm.prank(oracleAdmin);
        vm.expectRevert();
        oracle.setPolicy(120, 8_500, 2);

        vm.prank(governance);
        oracle.setPolicy(120, 8_500, 2);
        bytes32 oracleAdminRole = oracle.ORACLE_ADMIN_ROLE();
        vm.prank(governance);
        oracle.setRole(oracleAdminRole, oracleAdmin, false);
        require(!oracle.hasRole(oracleAdminRole, oracleAdmin));
        require(oracle.minimumIndependentSources() == 2);
    }

    function testLiveStateRequiresQualification() public {
        QualificationRegistry qualification = new QualificationRegistry();
        MarketRegistry registry = new MarketRegistry(address(qualification));
        bytes32 marketId = registry.registerEvmMarket(8453, address(1), keccak256("LIFECYCLE"));

        vm.expectRevert();
        registry.setState(marketId, MarketRegistry.MarketState.LIVE);
    }

    function testDefaultOracleRejectsSingleSourceExecution() public {
        OracleRouter oracle = new OracleRouter(120, 8_500);
        address updater = address(0xCAFE);
        oracle.setUpdater(updater, true);
        bytes32 marketId = keccak256("single-source");

        vm.prank(updater);
        oracle.setPrice(marketId, 1e18, 1, 9_500);

        vm.expectRevert();
        oracle.getExecutionPrice(marketId, true, true);
    }

    function testFinalizedOracleDisablesLegacyUpdaterPath() public {
        OracleRouter oracle = new OracleRouter(120, 8_500);
        address governance = address(0xD0D);
        address updater = address(0xE0E);
        oracle.setGovernanceExecutor(governance);
        oracle.setUpdater(updater, true);
        oracle.finalizeBootstrap();

        vm.prank(updater);
        vm.expectRevert();
        oracle.setPrice(keccak256("legacy-disabled"), 1e18, uint64(block.timestamp), 9_500);
    }

    function testReporterSetVersionCannotRollback() public {
        OracleRouter oracle = new OracleRouter(120, 8_500);
        bytes32 first = keccak256("reporters-1");
        bytes32 second = keccak256("reporters-2");
        oracle.setReporterThreshold(2, first);
        oracle.setReporterThreshold(2, second);
        vm.expectRevert();
        oracle.setReporterThreshold(2, first);
    }

    function testOracleRejectsInconsistentSourceCounts() public {
        OracleRouter oracle = new OracleRouter(120, 8_500);
        oracle.setUpdater(address(this), true);
        uint64 now64 = uint64(block.timestamp);
        IOracleRouter.OracleReport memory report = IOracleRouter.OracleReport({
            marketId: keccak256("inconsistent-sources"),
            arcChainId: oracle.domainChainId(),
            midPrice: 1e18,
            minPrice: 1e18,
            maxPrice: 1e18,
            confidenceBps: 9_500,
            sourceCount: 1,
            independentSourceCount: 2,
            observedAt: now64,
            validFrom: now64,
            expiresAt: now64 + 60,
            sequence: 1,
            evidenceRoot: bytes32(uint256(1)),
            reporterSetVersion: bytes32(0)
        });

        vm.expectRevert();
        oracle.setReport(report);
    }

    function testVaultRejectsFeeOnTransferCollateral() public {
        FeeOnTransferUsdc token = new FeeOnTransferUsdc();
        USDCMarginVault vault = new USDCMarginVault();
        token.mint(address(this), 1_000_000);
        vault.setCollateralToken(address(token));
        token.approve(address(vault), type(uint256).max);

        vm.expectRevert();
        vault.deposit(1_000_000);
        require(vault.rawCash() == 0);
    }

    function testLpControllerCannotRecordMoreThanCustody() public {
        FeeOnTransferUsdc token = new FeeOnTransferUsdc();
        PublicLPVault vault = new PublicLPVault(address(token), 1);

        vm.expectRevert();
        vault.recordManagedAssets(1);
    }

    function testUncoveredBadDebtReducesWithdrawableBacking() public {
        MockUSDC token = new MockUSDC();
        USDCMarginVault vault = new USDCMarginVault();
        vault.setCollateralToken(address(token));
        vault.setEngine(address(this));
        token.mint(address(this), 20_000_000);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(20_000_000);
        vault.lockCollateral(address(this), 20_000_000);
        vault.settlePositionWad(address(this), 20_000_000, -40e18, 0);

        require(vault.protocolBadDebt() == 20_000_000);
        require(vault.insuranceCoveredBadDebt() == 0);
        require(vault.withdrawableLiquidity() == 0);
    }
}
