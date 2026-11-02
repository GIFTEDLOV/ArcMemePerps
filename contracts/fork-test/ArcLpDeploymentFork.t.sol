// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "../src/IERC20.sol";
import { PublicLPVault } from "../src/PublicLPVault.sol";
import { USDCMarginVault } from "../src/USDCMarginVault.sol";
import { ProtocolTimelock } from "../src/ProtocolTimelock.sol";
import { MockUSDC } from "../test/MockUSDC.sol";

interface VmArcLpFork {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function expectRevert() external;
}

/// @notice No broadcast, signer or live asset transfer. Forge runs each test
/// against an isolated local fork of the Arc RPC snapshot.
contract ArcLpDeploymentForkTest {
    VmArcLpFork private constant vm =
        VmArcLpFork(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant USDC = 0x3600000000000000000000000000000000000000;
    address private constant OLD_LP = 0x9FF8358DC5eE866e0B9707D0139CF47B399F5257;
    address private constant OLD_MARGIN = 0xa818DD503641FFDfe11ff8A4B7E8020D2A36BCaf;
    address private constant GOVERNANCE = address(0xA001);
    address private constant GUARDIAN = address(0xA002);
    address private constant LP_A = address(0xA003);
    address private constant LP_B = address(0xA004);
    uint256 private constant ONE_DAY = 1 days;

    function testNewPairConfiguresAgainstRealArcUSDCWithoutTouchingExistingCustody() public {
        require(block.chainid == 5042, "wrong fork chain");
        require(USDC.code.length != 0, "Arc USDC not deployed");
        require(OLD_LP.code.length != 0 && OLD_MARGIN.code.length != 0, "missing old vault");
        (bool ok, bytes memory data) = USDC.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && data.length >= 32 && abi.decode(data, (uint256)) == 6, "Arc USDC decimals");

        uint256 previousMarginCash = IERC20(USDC).balanceOf(OLD_MARGIN);
        uint256 previousLpCash = IERC20(USDC).balanceOf(OLD_LP);
        // Fail safely if a previously inactive PublicLPVault becomes funded.
        require(!PublicLPVault(OLD_LP).publicLpActive(), "old LP has been activated");
        require(PublicLPVault(OLD_LP).totalShares() == 0, "old LP has outstanding shares");

        USDCMarginVault margin = new USDCMarginVault();
        PublicLPVault lp = new PublicLPVault(USDC, ONE_DAY);
        ProtocolTimelock timelock = new ProtocolTimelock(ONE_DAY);

        require(!lp.publicLpActive() && !lp.withdrawalSettlementEnabled(), "unsafe defaults");
        require(lp.asset() == IERC20(USDC), "incorrect LP token");
        require(lp.withdrawalCooldown() == ONE_DAY, "wrong cooldown");

        margin.setCollateralToken(USDC);
        margin.setEngine(address(this)); // simulated controller; no live engine binding
        lp.setRiskController(address(this));
        margin.setLpVault(address(lp));
        lp.setMarginVault(address(margin));
        require(margin.lpVault() == address(lp), "missing margin LP link");
        require(lp.marginVault() == address(margin), "missing LP margin link");

        lp.setGovernanceExecutor(address(timelock));
        margin.setGovernanceExecutor(address(timelock));
        timelock.setRole(timelock.GOVERNANCE_ADMIN_ROLE(), GOVERNANCE, true);
        timelock.setGovernanceExecutor(address(timelock));
        lp.finalizeBootstrap();
        margin.finalizeBootstrap();
        timelock.finalizeBootstrap();

        vm.expectRevert();
        lp.setPublicLpActive(true); // deployer cannot bypass governance after finalize
        require(!lp.publicLpActive(), "unexpectedly enabled");
        require(lp.totalShares() == 0 && lp.navAssets() == 0, "new LP begins funded");
        require(margin.rawCash() == 0 && margin.lpBacking() == 0, "new margin begins funded");

        // This is a simulated fork transaction executed by the local EVM.
        bytes memory activation = abi.encodeCall(PublicLPVault.setPublicLpActive, (true));
        vm.prank(GOVERNANCE);
        timelock.queue(address(lp), 0, activation, keccak256("fork-activation"));
        vm.expectRevert();
        timelock.execute(address(lp), 0, activation, keccak256("fork-activation"));
        vm.warp(block.timestamp + ONE_DAY);
        timelock.execute(address(lp), 0, activation, keccak256("fork-activation"));
        require(lp.publicLpActive(), "governed activation failed");

        // Real mainnet deployed contracts and trader collateral are untouched.
        require(IERC20(USDC).balanceOf(OLD_MARGIN) == previousMarginCash, "old margin changed");
        require(IERC20(USDC).balanceOf(OLD_LP) == previousLpCash, "old LP changed");
        require(PublicLPVault(OLD_LP).totalShares() == 0, "old shares changed");
    }

    function testForkRehearsalWithMockFundingProvesBackingAndDeRiskedExit() public {
        require(block.chainid == 5042, "fork mode required");
        // Mock token is intentionally used for funded test operations: no
        // mainnet account is impersonated and no user USDC is transferred.
        MockUSDC usdc = new MockUSDC();
        USDCMarginVault margin = new USDCMarginVault();
        PublicLPVault lp = new PublicLPVault(address(usdc), ONE_DAY);
        ProtocolTimelock timelock = new ProtocolTimelock(ONE_DAY);

        margin.setCollateralToken(address(usdc));
        margin.setEngine(address(this));
        margin.setLpVault(address(lp));
        lp.setMarginVault(address(margin));
        lp.setRiskController(address(this));
        lp.setRole(lp.EMERGENCY_ADMIN_ROLE(), GUARDIAN, true);
        margin.setGovernanceExecutor(address(timelock));
        lp.setGovernanceExecutor(address(timelock));
        timelock.setRole(timelock.GOVERNANCE_ADMIN_ROLE(), GOVERNANCE, true);
        timelock.setGovernanceExecutor(address(timelock));
        margin.finalizeBootstrap();
        lp.finalizeBootstrap();
        timelock.finalizeBootstrap();

        _execute(
            timelock,
            address(lp),
            abi.encodeCall(PublicLPVault.setPublicLpActive, (true)),
            "activate"
        );
        usdc.mint(LP_A, 1_000_000);
        usdc.mint(LP_B, 1_000_000);
        vm.prank(LP_A);
        usdc.approve(address(lp), 1_000_000);
        vm.prank(LP_B);
        usdc.approve(address(lp), 1_000_000);
        vm.prank(LP_A);
        lp.deposit(1_000_000);
        vm.prank(LP_B);
        lp.deposit(1_000_000);
        require(lp.totalShares() == 2_000_000, "incorrect share series");

        lp.setMarketRiskBudget(400_000);
        _execute(
            timelock,
            address(lp),
            abi.encodeCall(PublicLPVault.allocateToMargin, (400_000)),
            "allocate"
        );
        require(
            margin.lpBacking() == 400_000 && lp.allocatedBacking() == 400_000, "bad backing link"
        );
        require(lp.navAssets() == 2_000_000, "backing duplicated NAV");

        vm.prank(LP_A);
        lp.requestWithdraw(1_000_000);
        vm.warp(block.timestamp + ONE_DAY);
        vm.prank(LP_A);
        vm.expectRevert();
        lp.claimWithdraw();

        vm.prank(GUARDIAN);
        lp.emergencyPausePublicLp();
        vm.expectRevert();
        lp.certifyWithdrawalAccounting(); // risk and backing still live

        // Simulate reconciliation and return of actual allocated backing.
        _execute(
            timelock,
            address(lp),
            abi.encodeCall(PublicLPVault.recoverFromMargin, (400_000)),
            "recover"
        );
        lp.setMarketRiskBudget(0);
        require(lp.allocatedBacking() == 0 && margin.lpBacking() == 0, "backing not returned");
        lp.certifyWithdrawalAccounting();
        vm.prank(LP_A);
        lp.renewWithdrawalRequest();
        _execute(
            timelock,
            address(lp),
            abi.encodeCall(PublicLPVault.setWithdrawalSettlementEnabled, (true)),
            "enable-claim"
        );
        vm.prank(LP_A);
        require(lp.claimWithdraw() == 1_000_000, "fair payout failed");
        require(lp.totalShares() == 1_000_000, "remaining LP shares corrupted");
        require(lp.navAssets() == 1_000_000, "remaining LP NAV corrupted");
        require(usdc.balanceOf(address(lp)) == lp.managedAssets(), "LP custody mismatch");
        require(margin.rawCash() == 0, "margin custody residual");
    }

    function _execute(
        ProtocolTimelock timelock,
        address target,
        bytes memory callData,
        string memory label
    ) internal {
        bytes32 salt = keccak256(bytes(label));
        vm.prank(GOVERNANCE);
        timelock.queue(target, 0, callData, salt);
        vm.warp(block.timestamp + ONE_DAY);
        timelock.execute(target, 0, callData, salt);
    }
}
