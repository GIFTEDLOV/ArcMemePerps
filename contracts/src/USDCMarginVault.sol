// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IERC20 } from "./IERC20.sol";
import { IUSDCMarginVault } from "./interfaces/IUSDCMarginVault.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeTransferLib } from "./SafeTransferLib.sol";

/**
 * Isolated USDC accounting vault.
 *
 * Gate 3 deliberately has no ERC-4626 share accounting. The vault records the protocol
 * ledger and can be funded by the protocol owner; public LP participation is a later gate.
 * All external token calls are isolated in SafeTransferLib and state is written before
 * withdrawals. The zero-token mode remains available for deterministic accounting tests.
 */
contract USDCMarginVault is AccessControlled, IUSDCMarginVault, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    IERC20 private _collateralToken;
    mapping(address trader => uint256 amount) public freeCollateral;
    mapping(address trader => uint256 amount) public lockedCollateral;
    uint256 public totalFreeCollateral;
    uint256 public totalLockedCollateral;
    uint256 public rawCash;
    uint256 public protocolBacking;
    uint256 public accruedFees;
    uint256 public insuranceReserve;
    uint256 public realizedTraderPnlGains;
    uint256 public realizedTraderPnlLosses;
    uint256 public pendingPositivePnl;
    uint256 public pendingNegativePnl;
    uint256 public protocolBadDebt;
    address public engine;

    error UnauthorizedEngine();
    error InsufficientFreeCollateral();
    error InsufficientLockedCollateral();
    error InvalidCollateralToken();
    error InsufficientWithdrawableLiquidity();
    error TokenDecimalsUnavailable();

    event EngineSet(address indexed engine);
    event CollateralTokenSet(address indexed token, uint8 decimals);
    event AccountingCredit(address indexed trader, uint256 amount);
    event ProtocolBackingFunded(uint256 amount);
    event CollateralDeposited(address indexed trader, uint256 amount);
    event CollateralWithdrawn(address indexed trader, uint256 amount);
    event CollateralLocked(address indexed trader, uint256 amount);
    event CollateralUnlocked(address indexed trader, uint256 amount);
    event PositionSettled(address indexed trader, uint256 collateral, int256 pnl, uint256 badDebt);
    event FeeAccrued(uint256 amount);
    event InsuranceReserveAccrued(uint256 amount);
    event PendingPositivePnlUpdated(uint256 amount);

    modifier onlyEngine() {
        if (msg.sender != engine) revert UnauthorizedEngine();
        _;
    }

    modifier onlyEngineOrOwner() {
        if (msg.sender != engine && msg.sender != owner) revert UnauthorizedEngine();
        _;
    }

    function collateralToken() external view returns (address) {
        return address(_collateralToken);
    }

    function setCollateralToken(address token) external onlyOwner {
        if (token == address(0) || token.code.length == 0) revert InvalidCollateralToken();
        (bool success, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!success || data.length < 32) revert TokenDecimalsUnavailable();
        uint256 decimals = abi.decode(data, (uint256));
        if (decimals != 6) revert InvalidCollateralToken();
        _collateralToken = IERC20(token);
        emit CollateralTokenSet(token, 6);
    }

    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0 || address(_collateralToken) == address(0)) {
            revert InvalidCollateralToken();
        }
        _collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        freeCollateral[msg.sender] += amount;
        totalFreeCollateral += amount;
        rawCash += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0 || freeCollateral[msg.sender] < amount) {
            revert InsufficientFreeCollateral();
        }
        uint256 available = withdrawableLiquidity();
        if (amount > available) revert InsufficientWithdrawableLiquidity();
        freeCollateral[msg.sender] -= amount;
        totalFreeCollateral -= amount;
        rawCash -= amount;
        _collateralToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * Deterministic test/protocol backing path. It does not claim custody of real tokens.
     */
    function creditCollateral(address trader, uint256 amount) external onlyOwner {
        freeCollateral[trader] += amount;
        totalFreeCollateral += amount;
        rawCash += amount;
        emit AccountingCredit(trader, amount);
    }

    function fundProtocolBacking(uint256 amount) external onlyOwner {
        protocolBacking += amount;
        rawCash += amount;
        emit ProtocolBackingFunded(amount);
    }

    function accrueFee(uint256 amount) external onlyEngine {
        accruedFees += amount;
        rawCash += amount;
        emit FeeAccrued(amount);
    }

    function accrueInsuranceReserve(uint256 amount) external onlyEngine {
        insuranceReserve += amount;
        rawCash += amount;
        emit InsuranceReserveAccrued(amount);
    }

    function setPendingPositivePnl(uint256 amount) external onlyEngine {
        pendingPositivePnl = amount;
        emit PendingPositivePnlUpdated(amount);
    }

    function lockCollateral(address trader, uint256 amount) external onlyEngine {
        if (freeCollateral[trader] < amount) revert InsufficientFreeCollateral();
        freeCollateral[trader] -= amount;
        lockedCollateral[trader] += amount;
        totalFreeCollateral -= amount;
        totalLockedCollateral += amount;
        emit CollateralLocked(trader, amount);
    }

    function unlockCollateral(address trader, uint256 amount) external onlyEngineOrOwner {
        if (lockedCollateral[trader] < amount) revert InsufficientLockedCollateral();
        lockedCollateral[trader] -= amount;
        freeCollateral[trader] += amount;
        totalLockedCollateral -= amount;
        totalFreeCollateral += amount;
        emit CollateralUnlocked(trader, amount);
    }

    function settlePosition(address trader, uint256 collateral, int256 pnl)
        external
        onlyEngine
        returns (uint256 badDebt)
    {
        if (lockedCollateral[trader] < collateral) revert InsufficientLockedCollateral();
        lockedCollateral[trader] -= collateral;
        totalLockedCollateral -= collateral;
        if (pnl >= 0) {
            uint256 gain = _positiveInt(pnl);
            freeCollateral[trader] += collateral + gain;
            totalFreeCollateral += collateral + gain;
            realizedTraderPnlGains += gain;
        } else {
            uint256 loss = _negativeInt(pnl);
            if (loss <= collateral) {
                freeCollateral[trader] += collateral - loss;
                totalFreeCollateral += collateral - loss;
                realizedTraderPnlLosses += loss;
            } else {
                badDebt = loss - collateral;
                protocolBadDebt += badDebt;
                realizedTraderPnlLosses += collateral;
                pendingNegativePnl += badDebt;
            }
        }
        emit PositionSettled(trader, collateral, pnl, badDebt);
    }

    function withdrawableLiquidity() public view returns (uint256) {
        uint256 liabilities = totalFreeCollateral + totalLockedCollateral + pendingPositivePnl;
        if (rawCash <= liabilities) return 0;
        return rawCash - liabilities;
    }

    function totalAccountedAssets() external view returns (uint256) {
        return rawCash + pendingNegativePnl;
    }

    function _positiveInt(int256 value) private pure returns (uint256) {
        // value is proven non-negative by the branch at the call site.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(value);
    }

    function _negativeInt(int256 value) private pure returns (uint256) {
        if (value == type(int256).min) return 1 << 255;
        // value is proven negative by the branch at the call site.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(-value);
    }
}
