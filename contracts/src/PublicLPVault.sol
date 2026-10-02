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
    uint256 public marketRiskBudget;
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
    error CustodyDeltaMismatch();

    enum CustodyStatus {
        MATCH,
        SURPLUS,
        DEFICIT
    }

    event Deposited(address indexed account, uint256 assets, uint256 shares);
    event WithdrawalRequested(address indexed account, uint256 shares, uint64 availableAt);
    event Withdrawn(address indexed account, uint256 assets, uint256 shares);
    event TraderLiabilityUpdated(uint256 pendingLiability);
    event BadDebtRecorded(uint256 amount);
    event InsuranceAccounted(uint256 amount);
    event RiskControllerSet(address indexed controller);
    event ManagedAssetsReconciled(
        uint256 managedAssets, uint256 actualCustody, CustodyStatus status
    );
    event MarketRiskBudgetSet(uint256 riskBudget);

    modifier onlyController() {
        if (msg.sender != riskController && !(!bootstrapFinalized && msg.sender == owner)) {
            revert UnauthorizedController();
        }
        _;
    }

    constructor(address asset_, uint256 withdrawalCooldown_) {
        if (asset_ == address(0) || asset_.code.length == 0) revert InvalidAsset();
        asset = IERC20(asset_);
        withdrawalCooldown = withdrawalCooldown_;
    }

    function setRiskController(address controller) external onlyGovernanceExecutor {
        if (controller == address(0)) revert ZeroAddress();
        riskController = controller;
        emit RiskControllerSet(controller);
    }

    function navAssets() public view returns (uint256) {
        uint256 balance = asset.balanceOf(address(this));
        uint256 liabilities = pendingTraderLiability + insuranceReserve + cumulativeBadDebt;
        // managedAssets is the accounting source of truth. An unsolicited token
        // transfer is reported as surplus and cannot mint LP NAV.
        balance = managedAssets;
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
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), assets);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != assets) {
            revert CustodyDeltaMismatch();
        }
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
        uint256 available = managedAssets;
        uint256 reserved = pendingTraderLiability + insuranceReserve + cumulativeBadDebt;
        if (available < reserved || assets == 0 || assets > available - reserved) {
            revert InsufficientLiquidity();
        }
        withdrawals[msg.sender] = WithdrawalRequest(0, 0);
        shareBalance[msg.sender] -= request.shares;
        totalShares -= request.shares;
        managedAssets = managedAssets > assets ? managedAssets - assets : 0;
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransfer(msg.sender, assets);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (beforeBalance < afterBalance || beforeBalance - afterBalance != assets) {
            revert CustodyDeltaMismatch();
        }
        emit Withdrawn(msg.sender, assets, request.shares);
    }

    function recordTraderLiability(uint256 pendingLiability) external onlyController {
        pendingTraderLiability = pendingLiability;
        emit TraderLiabilityUpdated(pendingLiability);
    }

    function recordManagedAssets(uint256 assets) external onlyController {
        if (assets > asset.balanceOf(address(this))) revert InsufficientLiquidity();
        managedAssets = assets;
        (CustodyStatus status,,,) = custodyStatus();
        emit ManagedAssetsReconciled(assets, asset.balanceOf(address(this)), status);
    }

    function setMarketRiskBudget(uint256 riskBudget) external onlyController {
        if (riskBudget > navAssets()) revert InsufficientLiquidity();
        marketRiskBudget = riskBudget;
        emit MarketRiskBudgetSet(riskBudget);
    }

    function actualCustodyUsdc() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function expectedCustodyUsdc() external view returns (uint256) {
        return managedAssets;
    }

    function custodyStatus()
        public
        view
        returns (CustodyStatus status, uint256 actual, uint256 expected, uint256 difference)
    {
        actual = asset.balanceOf(address(this));
        expected = managedAssets;
        if (actual == expected) return (CustodyStatus.MATCH, actual, expected, 0);
        if (actual > expected) return (CustodyStatus.SURPLUS, actual, expected, actual - expected);
        return (CustodyStatus.DEFICIT, actual, expected, expected - actual);
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
