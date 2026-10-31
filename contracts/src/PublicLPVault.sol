// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IERC20 } from "./IERC20.sol";
import { IUSDCMarginVault } from "./interfaces/IUSDCMarginVault.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeTransferLib } from "./SafeTransferLib.sol";

/**
 * Production-oriented Public USDC Liquidity Pool for CLUSTER Perpetual Trading.
 *
 * Enforces:
 * 1. Proportional share ownership of pool Net Asset Value (NAV).
 * 2. Donation-immune accounting: NAV is bounded strictly by protocol-managed assets.
 *    Unsolicited token donations register as SURPLUS, permanently preventing share inflation attacks.
 * 3. Configurable max deposit pool cap.
 * 4. Bounded capital allocation to USDCMarginVault for protocol trading capacity.
 * 5. Minimum unallocated liquidity reserve (preserving LP withdrawal liquidity).
 * 6. Two-step queued withdrawal system with cooldown to prevent front-running settlement.
 * 7. Transparent trading fee revenue accrual directly to pool NAV.
 */
contract PublicLPVault is AccessControlled, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable asset;
    uint256 public immutable withdrawalCooldown;
    uint256 public totalShares;
    uint256 public managedAssets;
    uint256 public pendingTraderLiability;
    uint256 public insuranceReserve;
    uint256 public cumulativeBadDebt;
    uint256 public marketRiskBudget;
    address public riskController;
    bool public publicLpActive;

    // Configurable pool risk boundaries
    uint256 public maxPoolCap;
    address public authorizedMarginVault;
    uint256 public allocatedCapital;
    uint256 public maxAllocationRatioBps = 8_000; // 80% maximum allocated to margin vault

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
    error PoolCapExceeded();
    error UnauthorizedMarginVault();
    error MarginVaultQueryFailed();

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
    event MaxPoolCapSet(uint256 maxPoolCap);
    event MarginVaultAuthorized(address indexed vault);
    event MaxAllocationRatioSet(uint256 ratioBps);
    event CapitalAllocated(address indexed vault, uint256 amount);
    event CapitalReturned(address indexed vault, uint256 amount);
    event FeeRevenueRecorded(uint256 amount);

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

    function setAuthorizedMarginVault(address vault) external onlyGovernanceExecutor {
        if (vault == address(0)) revert ZeroAddress();
        authorizedMarginVault = vault;
        emit MarginVaultAuthorized(vault);
    }

    function setMaxPoolCap(uint256 cap) external onlyGovernanceExecutor {
        maxPoolCap = cap;
        emit MaxPoolCapSet(cap);
    }

    function setMaxAllocationRatioBps(uint256 ratioBps) external onlyGovernanceExecutor {
        if (ratioBps > 9_500) revert InvalidAmount(); // Must preserve at least 5% reserve
        maxAllocationRatioBps = ratioBps;
        emit MaxAllocationRatioSet(ratioBps);
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
     * Emergency control turns public deposits off without impacting withdrawals.
     */
    function emergencyPausePublicLp() external onlyEmergencyAdmin {
        if (!publicLpActive) revert InvalidActivationState();
        publicLpActive = false;
        emit PublicLPActivationSet(false, msg.sender);
    }

    /**
     * Calculates the pool's net asset value based on economic recoverable equity.
     * Separates economic asset value from immediate withdrawal liquidity:
     * - Local physical cash: asset.balanceOf(address(this))
     * - Economic equity in Margin Vault: rawCash - seniorTraderLiabilities (collateral & positive PnL)
     *   bounded by allocatedCapital.
     * Temporary position locking does not depress LP asset value;
     * Realized bad debt and positive trader PnL reduce net equity economically.
     * Capped by managedAssets to prevent donation inflation attacks.
     */
    function navAssets() public view returns (uint256) {
        uint256 liquidBalance = asset.balanceOf(address(this));
        uint256 economicAllocated = allocatedCapital;
        uint256 onchainBadDebt = 0;

        if (authorizedMarginVault != address(0)) {
            if (authorizedMarginVault.code.length == 0) revert MarginVaultQueryFailed();
            try IUSDCMarginVault(authorizedMarginVault).rawCash() returns (uint256 marginCash) {
                try IUSDCMarginVault(authorizedMarginVault).traderLiabilities() returns (uint256 seniorTraderLiabilities) {
                    uint256 marginNetEquity = marginCash > seniorTraderLiabilities
                        ? marginCash - seniorTraderLiabilities
                        : 0;
                    if (marginNetEquity < economicAllocated) {
                        economicAllocated = marginNetEquity;
                    }
                } catch {
                    revert MarginVaultQueryFailed();
                }
            } catch {
                revert MarginVaultQueryFailed();
            }

            try IUSDCMarginVault(authorizedMarginVault).cumulativeUncoveredBadDebt() returns (uint256 debt) {
                onchainBadDebt = debt;
            } catch {
                revert MarginVaultQueryFailed();
            }
        }

        uint256 totalEconomicAssets = liquidBalance + economicAllocated;
        uint256 grossAssets = managedAssets < totalEconomicAssets ? managedAssets : totalEconomicAssets;

        uint256 debtToDeduct = authorizedMarginVault != address(0) ? onchainBadDebt : cumulativeBadDebt;
        uint256 deductions = insuranceReserve + debtToDeduct;
        if (authorizedMarginVault == address(0)) {
            deductions += pendingTraderLiability;
        }

        return grossAssets > deductions ? grossAssets - deductions : 0;
    }

    function sharePriceWad() public view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (navAssets() * 1e18) / totalShares;
    }

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (!publicLpActive) revert PublicLPInactive();
        if (assets == 0) revert InvalidAmount();
        if (maxPoolCap != 0 && managedAssets + assets > maxPoolCap) revert PoolCapExceeded();

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

        // Strict unencumbered liquid cash availability check
        uint256 liquidBalance = asset.balanceOf(address(this));
        if (assets > liquidBalance) {
            revert InsufficientLiquidity(); // Allocated capital must be returned from margin vault first
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

    /**
     * Bounded capital allocation to the authorized USDCMarginVault for trading capacity.
     */
    function allocateToMarginVault(uint256 amount) external onlyController nonReentrant {
        if (authorizedMarginVault == address(0)) revert UnauthorizedMarginVault();
        if (amount == 0) revert InvalidAmount();

        uint256 nav = navAssets();
        uint256 maxAllocatable = (nav * maxAllocationRatioBps) / BPS_DENOMINATOR;
        if (allocatedCapital + amount > maxAllocatable) revert InsufficientLiquidity();

        uint256 liquidCash = asset.balanceOf(address(this));
        if (amount > liquidCash) revert InsufficientLiquidity();

        allocatedCapital += amount;

        asset.approve(authorizedMarginVault, amount);
        IUSDCMarginVault(authorizedMarginVault).fundProtocolBacking(amount);

        emit CapitalAllocated(authorizedMarginVault, amount);
    }

    /**
     * Returns capital from USDCMarginVault back into PublicLPVault liquid reserves.
     */
    function returnFromMarginVault(uint256 amount) external onlyController nonReentrant {
        if (authorizedMarginVault == address(0)) revert UnauthorizedMarginVault();
        if (amount == 0 || amount > allocatedCapital) revert InvalidAmount();

        uint256 beforeBalance = asset.balanceOf(address(this));
        IUSDCMarginVault(authorizedMarginVault).returnProtocolBacking(address(this), amount);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert CustodyDeltaMismatch();
        }

        allocatedCapital -= amount;
        emit CapitalReturned(authorizedMarginVault, amount);
    }

    /**
     * Accrues verified trading fee revenue to pool managed assets.
     * Enforces that physical USDC custody is received before expanding NAV.
     * Unrecorded surplus = (liquidCash + allocatedCapital) - managedAssets.
     */
    function recordFeeRevenue(uint256 feeAmount) external nonReentrant {
        if (
            msg.sender != riskController && msg.sender != authorizedMarginVault
                && !(!bootstrapFinalized && msg.sender == owner)
        ) {
            revert UnauthorizedController();
        }
        if (feeAmount == 0) revert InvalidAmount();
        uint256 actualCustody = asset.balanceOf(address(this)) + allocatedCapital;
        if (actualCustody < managedAssets + feeAmount) {
            revert CustodyDeltaMismatch();
        }
        managedAssets += feeAmount;
        emit FeeRevenueRecorded(feeAmount);
    }

    /**
     * Direct atomic fee deposit. Pulls fee tokens directly into the vault
     * via safeTransferFrom, verifies custody delta, and records fee revenue.
     */
    function depositFeeRevenue(uint256 feeAmount) external nonReentrant {
        if (feeAmount == 0) revert InvalidAmount();
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), feeAmount);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != feeAmount) {
            revert CustodyDeltaMismatch();
        }
        managedAssets += feeAmount;
        emit FeeRevenueRecorded(feeAmount);
    }

    function recordTraderLiability(uint256 pendingLiability) external onlyController {
        pendingTraderLiability = pendingLiability;
        emit TraderLiabilityUpdated(pendingLiability);
    }

    function recordManagedAssets(uint256 assets) external onlyController {
        if (assets > asset.balanceOf(address(this)) + allocatedCapital) revert InsufficientLiquidity();
        managedAssets = assets;
        (CustodyStatus status,,,) = custodyStatus();
        emit ManagedAssetsReconciled(assets, asset.balanceOf(address(this)) + allocatedCapital, status);
    }

    function setMarketRiskBudget(uint256 riskBudget) external onlyController {
        if (riskBudget > navAssets()) revert InsufficientLiquidity();
        marketRiskBudget = riskBudget;
        emit MarketRiskBudgetSet(riskBudget);
    }

    function actualCustodyUsdc() external view returns (uint256) {
        return asset.balanceOf(address(this)) + allocatedCapital;
    }

    function liquidCustodyUsdc() external view returns (uint256) {
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
        actual = asset.balanceOf(address(this)) + allocatedCapital;
        expected = managedAssets;
        if (actual == expected) return (CustodyStatus.MATCH, actual, expected, 0);
        if (actual > expected) return (CustodyStatus.SURPLUS, actual, expected, actual - expected);
        return (CustodyStatus.DEFICIT, actual, expected, expected - actual);
    }

    /**
     * Idempotent bad debt reconciliation.
     * Reconciles authoritatively against margin vault uncovered bad debt if wired,
     * or enforces monotonic non-duplicate reporting to prevent double-counting.
     */
    function recordBadDebt(uint256 amount) external onlyController {
        if (authorizedMarginVault != address(0)) {
            uint256 onchainBadDebt = IUSDCMarginVault(authorizedMarginVault).cumulativeUncoveredBadDebt();
            if (onchainBadDebt > 0) {
                cumulativeBadDebt = onchainBadDebt;
                emit BadDebtRecorded(cumulativeBadDebt);
                return;
            }
        }
        if (amount > cumulativeBadDebt) {
            cumulativeBadDebt = amount;
            emit BadDebtRecorded(amount);
        }
    }

    /**
     * Public authoritative reconciliation with on-chain margin vault uncovered bad debt.
     * Updates cumulativeBadDebt to match the exact live uncovered bad debt from margin vault,
     * cleanly handling both debt increases and full/partial insurance recoveries to 0.
     */
    function reconcileBadDebt() external returns (uint256) {
        if (authorizedMarginVault != address(0)) {
            cumulativeBadDebt = IUSDCMarginVault(authorizedMarginVault).cumulativeUncoveredBadDebt();
            emit BadDebtRecorded(cumulativeBadDebt);
            return cumulativeBadDebt;
        }
        return cumulativeBadDebt;
    }

    function accountInsurance(uint256 amount) external onlyController {
        insuranceReserve = amount;
        emit InsuranceAccounted(amount);
    }
}
