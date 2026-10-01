// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ADLController, IAdlEngine } from "../src/ADLController.sol";
import { AccessControlled } from "../src/AccessControlled.sol";
import { ProtocolTimelock } from "../src/ProtocolTimelock.sol";
import { PublicLPVault } from "../src/PublicLPVault.sol";
import { MockUSDC } from "./MockUSDC.sol";

interface VmGate4D {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function getBlockTimestamp() external view returns (uint256);
    function expectRevert() external;
}

contract TimelockTarget is AccessControlled {
    uint256 public value;

    function setValue(uint256 value_) external onlyGovernanceExecutor {
        value = value_;
    }
}

contract MockAdlEngine is IAdlEngine {
    uint256 public lastPositionId;
    uint256 public lastReduction;
    uint256 public lastPrice;

    function adlReducePosition(uint256 positionId, uint256 sizeReduced, uint256 executionPrice)
        external
    {
        lastPositionId = positionId;
        lastReduction = sizeReduced;
        lastPrice = executionPrice;
    }
}

contract Gate4DCompletionTest {
    VmGate4D private constant vm =
        VmGate4D(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testPublicLpQueueAndLiabilitySafeNav() public {
        MockUSDC usdc = new MockUSDC();
        PublicLPVault vault = new PublicLPVault(address(usdc), 10);
        usdc.mint(address(this), 1_000_000);
        usdc.approve(address(vault), type(uint256).max);

        uint256 shares = vault.deposit(1_000_000);
        require(shares == 1_000_000);
        require(vault.sharePriceWad() == 1e18);

        vault.recordTraderLiability(200_000);
        require(vault.navAssets() == 800_000);
        require(vault.sharePriceWad() == 8e17);

        vault.requestWithdraw(500_000);
        vm.expectRevert();
        vault.claimWithdraw();

        vm.warp(vm.getBlockTimestamp() + 10);
        uint256 withdrawn = vault.claimWithdraw();
        require(withdrawn == 400_000);
        require(vault.totalShares() == 500_000);
        require(vault.pendingTraderLiability() == 200_000);
    }

    function testPublicLpCannotMintAgainstZeroNav() public {
        MockUSDC usdc = new MockUSDC();
        PublicLPVault vault = new PublicLPVault(address(usdc), 1);
        usdc.mint(address(this), 2_000_000);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1_000_000);
        vault.recordTraderLiability(1_000_000);
        vm.expectRevert();
        vault.deposit(1_000_000);
    }

    function testPublicLpUnexpectedTransferIsSurplusNotNav() public {
        MockUSDC usdc = new MockUSDC();
        PublicLPVault vault = new PublicLPVault(address(usdc), 1);
        usdc.mint(address(this), 1_000_000);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1_000_000);
        usdc.mint(address(vault), 500_000);
        require(vault.navAssets() == 1_000_000);
        (PublicLPVault.CustodyStatus status,,, uint256 difference) = vault.custodyStatus();
        require(status == PublicLPVault.CustodyStatus.SURPLUS && difference == 500_000);
    }

    function testAdlBudgetAndReplayProtection() public {
        MockAdlEngine engine = new MockAdlEngine();
        ADLController controller = new ADLController(address(engine));
        address keeper = address(0xBEEF);
        bytes32 episode = keccak256("episode-1");
        controller.setKeeper(keeper);
        controller.openEpisode(episode, 100);
        controller.registerCandidate(episode, 7, 90, 123);

        vm.prank(keeper);
        controller.execute(episode, 7, 60, 2e18);
        require(engine.lastPositionId() == 7);
        require(engine.lastReduction() == 60);
        require(controller.remainingDeficit(episode) == 40);

        vm.prank(keeper);
        vm.expectRevert();
        controller.execute(episode, 7, 1, 2e18);

        controller.registerCandidate(episode, 8, 90, 100);
        vm.prank(keeper);
        vm.expectRevert();
        controller.execute(episode, 8, 41, 2e18);
    }

    function testTimelockCannotExecuteBeforeEtaAndConsumesOperation() public {
        ProtocolTimelock timelock = new ProtocolTimelock(10);
        TimelockTarget target = new TimelockTarget();
        target.setGovernanceExecutor(address(timelock));
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (42));
        bytes32 salt = keccak256("salt");
        timelock.queue(address(target), 0, data, salt);

        vm.expectRevert();
        timelock.execute(address(target), 0, data, salt);

        vm.warp(vm.getBlockTimestamp() + 10);
        timelock.execute(address(target), 0, data, salt);
        require(target.value() == 42);

        vm.expectRevert();
        timelock.execute(address(target), 0, data, salt);
    }

    function testGovernanceExecutorCanCallNormalConfigurationPath() public {
        TimelockTarget target = new TimelockTarget();
        address executor = address(0xCAFE);
        target.setGovernanceExecutor(executor);
        vm.prank(executor);
        target.setValue(7);
        require(target.value() == 7);
    }
}
