// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IERC20 } from "./IERC20.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeTransferLib } from "./SafeTransferLib.sol";

/**
 *  Queued public LP accounting. NAV includes pending profitable-trader
 * liabilities and withdrawals cannot settle in the same block as a deposit.
 */
contract PublicLPVault is AccessControlled, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    IERC20 public immutable asset;
    uint256 public immutable withdrawalCooldown;
    uint256 public totalShares;
    uint256 public managedAssets;
    uint256 public pendingTraderLiability;
    uint256 public insuranceReserve;
    uint256 public cumulativeBadDebt;
    address public riskController;
    mapping(address account => uint256 shares) public shareBalance;
    mapping(address account => WithdrawalRequest request) public withdrawals;

    struct WithdrawalRequest {
        uint256 shares;
        uint64 availableAt;
    }

    error InvalidAsset();
    error UnauthorizedController();
    error InvalidAmount();
    error InsufficientShares();
    error CooldownActive();
    error InsufficientLiquidity();

    event Deposited(address indexed account, uint256 assets, uint256 shares);
    event WithdrawalRequested(address indexed account, uint256 shares, uint64 availableAt);
    event Withdrawn(address indexed account, uint256 assets, uint256 shares);
    event TraderLiabilityUpdated(uint256 pendingLiability);
    event BadDebtRecorded(uint256 amount);
    event InsuranceAccounted(uint256 amount);
    event RiskControllerSet(address indexed controller);

    modifier onlyController() {
        if (msg.sender != riskController && msg.sender != owner) revert UnauthorizedController();
        _;
    }

    constructor(address asset_, uint256 withdrawalCooldown_) {
        if (asset_ == address(0) || asset_.code.length == 0) revert InvalidAsset();
        asset = IERC20(asset_);
        withdrawalCooldown = withdrawalCooldown_;
    }

    function setRiskController(address controller) external onlyOwner {
        if (controller == address(0)) revert ZeroAddress();
        riskController = controller;
        emit RiskControllerSet(controller);
    }

    function navAssets() public view returns (uint256) {
        uint256 balance = asset.balanceOf(address(this));
        uint256 liabilities = pendingTraderLiability + insuranceReserve;
        return balance > liabilities ? balance - liabilities : 0;
    }

    function sharePriceWad() public view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (navAssets() * 1e18) / totalShares;
    }

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert InvalidAmount();
        uint256 navBefore = navAssets();
        if (totalShares != 0 && navBefore == 0) revert InsufficientLiquidity();
        shares = totalShares == 0 ? assets : (assets * totalShares) / navBefore;
        if (shares == 0) revert InvalidAmount();
        asset.safeTransferFrom(msg.sender, address(this), assets);
        shareBalance[msg.sender] += shares;
        totalShares += shares;
        managedAssets += assets;
        emit Deposited(msg.sender, assets, shares);
    }

    function requestWithdraw(uint256 shares) external {
        if (shares == 0 || shareBalance[msg.sender] < shares) revert InsufficientShares();
        WithdrawalRequest storage request = withdrawals[msg.sender];
        request.shares += shares;
        uint256 availableAt = block.timestamp + withdrawalCooldown;
        // Timestamp is used only for the bounded withdrawal queue window.
        // forge-lint: disable-next-line(block-timestamp)
        if (availableAt > type(uint64).max) revert InvalidAmount();
        // forge-lint: disable-next-line(unsafe-typecast)
        request.availableAt = uint64(availableAt);
        emit WithdrawalRequested(msg.sender, shares, request.availableAt);
    }

    function claimWithdraw() external nonReentrant returns (uint256 assets) {
        WithdrawalRequest memory request = withdrawals[msg.sender];
        if (request.shares == 0 || shareBalance[msg.sender] < request.shares) {
            revert InsufficientShares();
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < request.availableAt) revert CooldownActive();
        assets = (request.shares * navAssets()) / totalShares;
        uint256 available = asset.balanceOf(address(this));
        if (
            available < pendingTraderLiability || assets == 0
                || assets > available - pendingTraderLiability
        ) {
            revert InsufficientLiquidity();
        }
        withdrawals[msg.sender] = WithdrawalRequest(0, 0);
        shareBalance[msg.sender] -= request.shares;
        totalShares -= request.shares;
        managedAssets = managedAssets > assets ? managedAssets - assets : 0;
        asset.safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, assets, request.shares);
    }

    function recordTraderLiability(uint256 pendingLiability) external onlyController {
        pendingTraderLiability = pendingLiability;
        emit TraderLiabilityUpdated(pendingLiability);
    }

    function recordBadDebt(uint256 amount) external onlyController {
        cumulativeBadDebt += amount;
        emit BadDebtRecorded(amount);
    }

    function accountInsurance(uint256 amount) external onlyController {
        insuranceReserve = amount;
        emit InsuranceAccounted(amount);
    }
}
