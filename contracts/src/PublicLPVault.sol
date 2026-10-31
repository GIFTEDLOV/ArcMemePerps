// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IERC20 } from "./IERC20.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeTransferLib } from "./SafeTransferLib.sol";

interface ILpMarginCustody {
    function collateralToken() external view returns (address);
    function lpVault() external view returns (address);
    function lpRecoverable() external view returns (uint256);
    function receiveLpBacking(uint256 amount) external;
    function returnLpBacking(uint256 amount) external;
    function writeDownLpBacking(uint256 amount) external;
}

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
    address public marginVault;
    uint256 public allocatedBacking;
    uint256 public cumulativeLpBackingLosses;
    address public riskController;
    bool public publicLpActive;
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
    error PublicLPInactive();
    error ActivationUnsafe();
    error InvalidActivationState();
    error InvalidMarginVault();

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
    event PublicLPActivationSet(bool active, address indexed actor);
    event MarginVaultLinked(address indexed vault);
    event LpBackingAllocated(uint256 amount);
    event LpBackingRecovered(uint256 amount);
    event LpBackingLossRealized(uint256 amount);

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

    function setMarginVault(address vault) external onlyGovernanceExecutor {
        if (marginVault != address(0) || vault == address(0) || vault.code.length == 0) {
            revert InvalidMarginVault();
        }
        ILpMarginCustody margin = ILpMarginCustody(vault);
        if (margin.collateralToken() != address(asset) || margin.lpVault() != address(this)) {
            revert InvalidMarginVault();
        }
        marginVault = vault;
        emit MarginVaultLinked(vault);
    }

    /** Only finalized governance may allocate governed capital to the verified margin vault. */
    function allocateToMargin(uint256 amount) external onlyGovernanceExecutor nonReentrant {
        if (
            !bootstrapFinalized || !publicLpActive || marginVault == address(0)
                || amount == 0 || allocatedBacking + amount > marketRiskBudget
        ) revert ActivationUnsafe();
        (CustodyStatus status,,,) = custodyStatus();
        uint256 reserved = pendingTraderLiability + insuranceReserve + cumulativeBadDebt;
        if (status != CustodyStatus.MATCH || managedAssets < reserved
            || amount > managedAssets - reserved) revert InsufficientLiquidity();

        managedAssets -= amount;
        allocatedBacking += amount;
        asset.safeTransfer(marginVault, amount);
        ILpMarginCustody(marginVault).receiveLpBacking(amount);
        emit LpBackingAllocated(amount);
    }

    /** Only the verified recoverable residual may return to the LP share issuer. */
    function recoverFromMargin(uint256 amount) external onlyGovernanceExecutor nonReentrant {
        if (marginVault == address(0) || !bootstrapFinalized
            || amount == 0 || amount > allocatedBacking) revert InsufficientLiquidity();
        uint256 beforeBalance = asset.balanceOf(address(this));
        ILpMarginCustody(marginVault).returnLpBacking(amount);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert CustodyDeltaMismatch();
        }
        allocatedBacking -= amount;
        managedAssets += amount;
        emit LpBackingRecovered(amount);
    }

    /** Realize verified lost backing without falsely creating USDC or NAV. */
    function realizeBackingLoss(uint256 amount) external onlyGovernanceExecutor nonReentrant {
        if (marginVault == address(0) || !bootstrapFinalized
            || amount == 0 || amount > allocatedBacking) revert InsufficientLiquidity();
        ILpMarginCustody(marginVault).writeDownLpBacking(amount);
        allocatedBacking -= amount;
        cumulativeLpBackingLosses += amount;
        emit LpBackingLossRealized(amount);
    }

    function setRiskController(address controller) external onlyGovernanceExecutor {
        if (controller == address(0)) revert ZeroAddress();
        riskController = controller;
        emit RiskControllerSet(controller);
    }

    /**
     * Public LP deposits are disabled until the release ceremony has assigned
     * the controller and reconciled custody. The governance executor is the
     * only authority that may enable or re-enable deposits.
     */
    function setPublicLpActive(bool active) external onlyGovernanceExecutor {
        if (publicLpActive == active) revert InvalidActivationState();
        if (active) {
            if (!bootstrapFinalized || riskController == address(0)) revert ActivationUnsafe();
            (CustodyStatus status,,,) = custodyStatus();
            if (status != CustodyStatus.MATCH) revert ActivationUnsafe();
            if (cumulativeBadDebt != 0) revert ActivationUnsafe();
            uint256 nav = navAssets();
            if (
                (managedAssets != 0 || pendingTraderLiability != 0 || insuranceReserve != 0)
                    && nav == 0
            ) revert ActivationUnsafe();
            if (totalShares != 0 && nav == 0) revert ActivationUnsafe();
            if (marketRiskBudget > nav) revert ActivationUnsafe();
        }
        publicLpActive = active;
        emit PublicLPActivationSet(active, msg.sender);
    }

    /**
     * Emergency control only turns public deposits off. Withdrawals and claims
     * remain available subject to the existing queue, NAV, and liquidity checks.
     */
    function emergencyPausePublicLp() external onlyEmergencyAdmin {
        if (!publicLpActive) revert InvalidActivationState();
        publicLpActive = false;
        emit PublicLPActivationSet(false, msg.sender);
    }

    function navAssets() public view returns (uint256) {
        uint256 balance = managedAssets;
        // Only recoverable LP-attributable margin equity counts as NAV;
        // nominal allocations already consumed by trader wins are not assets.
        if (allocatedBacking != 0 && marginVault != address(0)) {
            uint256 recoverable = ILpMarginCustody(marginVault).lpRecoverable();
            balance += recoverable < allocatedBacking ? recoverable : allocatedBacking;
        }
        uint256 liabilities = pendingTraderLiability + insuranceReserve + cumulativeBadDebt;
        // Unsolicited token transfers are surplus and never silently mint NAV.
        return balance > liabilities ? balance - liabilities : 0;
    }

    function sharePriceWad() public view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (navAssets() * 1e18) / totalShares;
    }

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (!publicLpActive) revert PublicLPInactive();
        // Never reset the share series while old allocated backing remains.
        if (totalShares == 0 && allocatedBacking != 0) revert InsufficientLiquidity();
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
        // Each account may queue at most its currently owned shares, even
        // across repeated requests. Do not create impossible withdrawal claims.
        uint256 queuedShares = request.shares + shares;
        if (queuedShares > shareBalance[msg.sender]) revert InsufficientShares();
        request.shares = queuedShares;
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
        // Closing the final share series requires all historic backing to
        // return or be explicitly written down, preventing cross-generation PnL.
        if (request.shares == totalShares && allocatedBacking != 0) {
            revert InsufficientLiquidity();
        }
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
