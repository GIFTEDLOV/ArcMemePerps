// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { FixedPointMath } from "./FixedPointMath.sol";
import { IERC20 } from "./IERC20.sol";
import { IUSDCMarginVault } from "./interfaces/IUSDCMarginVault.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeCast } from "./SafeCast.sol";
import { SafeTransferLib } from "./SafeTransferLib.sol";

/**
 * V1 isolated USDC custody and liability ledger.
 *
 * The ERC-20 USDC interface is the only production collateral transport. `rawCash` is the
 * canonical internal custody ledger and is changed only when the vault itself receives or
 * sends USDC. Trader liabilities and protocol annotations are tracked separately so an
 * unexpected transfer is reported as SURPLUS instead of silently becoming revenue.
 */
contract USDCMarginVault is AccessControlled, IUSDCMarginVault, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    IERC20 private _collateralToken;
    mapping(address trader => uint256 amount) public freeCollateral;
    mapping(address trader => uint256 amount) public lockedCollateral;
    uint256 public totalFreeCollateral;
    uint256 public totalLockedCollateral;

    // rawCash is physical ERC-20 custody as represented by protocol-controlled transitions.
    uint256 public rawCash;
    uint256 public protocolBacking;
    uint256 public accruedFees;
    uint256 public insuranceReserve;
    uint256 public realizedTraderPnlGains;
    uint256 public realizedTraderPnlLosses;
    uint256 public pendingPositivePnl;
    uint256 public pendingNegativePnl;
    uint256 public protocolBadDebt;
    uint256 public insuranceCoveredBadDebt;
    address public engine;

    error UnauthorizedEngine();
    error InsufficientFreeCollateral();
    error InsufficientLockedCollateral();
    error InvalidCollateralToken();
    error InsufficientWithdrawableLiquidity();
    error TokenDecimalsUnavailable();
    error RealCustodyRequired();
    error InvalidSettlement();

    event EngineSet(address indexed engine);
    event CollateralTokenSet(address indexed token, uint8 decimals);
    event AccountingCredit(address indexed trader, uint256 amount);
    event ProtocolBackingFunded(uint256 amount);
    event CollateralDeposited(address indexed trader, uint256 amount);
    event CollateralWithdrawn(address indexed trader, uint256 amount);
    event CollateralLocked(address indexed trader, uint256 amount);
    event CollateralUnlocked(address indexed trader, uint256 amount);
    event PositionSettled(address indexed trader, uint256 collateral, int256 pnl, uint256 badDebt);
    event PartialPositionSettled(
        address indexed trader, uint256 collateral, int256 pnlUsdWad, uint256 fee, uint256 payout
    );
    event AccruedPositionCostSettled(
        address indexed trader, int256 signedCostUsdWad, uint256 newCollateral, uint256 badDebt
    );
    event LiquidationSettled(
        address indexed trader,
        address indexed liquidator,
        uint256 collateral,
        int256 pnlUsdWad,
        uint256 liquidatorReward,
        uint256 residual,
        uint256 badDebt
    );
    event FeeAccrued(uint256 amount);
    event InsuranceReserveAccrued(uint256 amount);
    event PendingPositivePnlUpdated(uint256 amount);
    event InsuranceCoverageReceived(uint256 amount);

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
        // The guard is held while calling an untrusted ERC-20 implementation.
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
        // Effects precede the external token transfer and the guard remains held.
        freeCollateral[msg.sender] -= amount;
        totalFreeCollateral -= amount;
        rawCash -= amount;
        _collateralToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * Gate 1 compatibility path; disabled after a real token is configured.
     */
    function creditCollateral(address trader, uint256 amount) external onlyOwner {
        if (address(_collateralToken) != address(0)) revert RealCustodyRequired();
        freeCollateral[trader] += amount;
        totalFreeCollateral += amount;
        rawCash += amount;
        emit AccountingCredit(trader, amount);
    }

    function fundProtocolBacking(uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidSettlement();
        if (address(_collateralToken) != address(0)) {
            _collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        }
        protocolBacking += amount;
        rawCash += amount;
        emit ProtocolBackingFunded(amount);
    }

    function accrueFee(uint256 amount) external onlyEngine {
        accruedFees += amount;
        emit FeeAccrued(amount);
    }

    function collectFee(address trader, uint256 amount) external onlyEngine {
        if (amount == 0) return;
        if (freeCollateral[trader] < amount) revert InsufficientFreeCollateral();
        freeCollateral[trader] -= amount;
        totalFreeCollateral -= amount;
        accruedFees += amount;
        emit FeeAccrued(amount);
    }

    function accrueInsuranceReserve(uint256 amount) external onlyEngine {
        insuranceReserve += amount;
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

    /**
     * Gate 1 compatibility settlement; pnl is denominated in raw USDC units.
     */
    function settlePosition(address trader, uint256 collateral, int256 pnl)
        external
        onlyEngine
        returns (uint256 badDebt)
    {
        if (lockedCollateral[trader] < collateral) revert InsufficientLockedCollateral();
        lockedCollateral[trader] -= collateral;
        totalLockedCollateral -= collateral;
        if (pnl >= 0) {
            uint256 gain = SafeCast.toUint256(pnl);
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
                pendingNegativePnl += badDebt;
                realizedTraderPnlLosses += collateral;
            }
        }
        emit PositionSettled(trader, collateral, pnl, badDebt);
    }

    function settleAccruedWad(address trader, uint256 positionCollateral, int256 signedCostUsdWad)
        external
        onlyEngine
        returns (uint256 newPositionCollateral, uint256 badDebt)
    {
        if (lockedCollateral[trader] < positionCollateral) revert InsufficientLockedCollateral();
        newPositionCollateral = positionCollateral;
        if (signedCostUsdWad >= 0) {
            uint256 cost = FixedPointMath.usdWadToUsdcUp(SafeCast.toUint256(signedCostUsdWad));
            if (cost >= positionCollateral) {
                badDebt = cost - positionCollateral;
                newPositionCollateral = 0;
                lockedCollateral[trader] -= positionCollateral;
                totalLockedCollateral -= positionCollateral;
                protocolBadDebt += badDebt;
                pendingNegativePnl += badDebt;
                realizedTraderPnlLosses += positionCollateral;
            } else {
                newPositionCollateral = positionCollateral - cost;
                lockedCollateral[trader] -= cost;
                totalLockedCollateral -= cost;
                realizedTraderPnlLosses += cost;
            }
        } else {
            uint256 credit = FixedPointMath.usdWadToUsdcDown(_negativeInt(signedCostUsdWad));
            newPositionCollateral += credit;
            lockedCollateral[trader] += credit;
            totalLockedCollateral += credit;
            pendingPositivePnl += credit;
        }
        emit AccruedPositionCostSettled(trader, signedCostUsdWad, newPositionCollateral, badDebt);
    }

    function settlePositionWad(
        address trader,
        uint256 collateral,
        int256 netPnlUsdWad,
        uint256 feeUsdc
    ) external onlyEngine returns (uint256 badDebt) {
        if (lockedCollateral[trader] < collateral) {
            revert InsufficientLockedCollateral();
        }
        lockedCollateral[trader] -= collateral;
        totalLockedCollateral -= collateral;

        uint256 gain = 0;
        uint256 loss = 0;
        if (netPnlUsdWad >= 0) {
            gain = FixedPointMath.usdWadToUsdcDown(SafeCast.toUint256(netPnlUsdWad));
        } else {
            loss = FixedPointMath.usdWadToUsdcUp(_negativeInt(netPnlUsdWad));
        }

        uint256 available = loss >= collateral ? 0 : collateral - loss;
        uint256 grossPayout = loss >= collateral ? 0 : collateral - loss + gain;
        uint256 feeCollected = feeUsdc > grossPayout ? grossPayout : feeUsdc;
        uint256 payout = grossPayout - feeCollected;
        if (feeCollected > 0) accruedFees += feeCollected;
        if (loss > collateral) {
            badDebt = loss - collateral;
            protocolBadDebt += badDebt;
            pendingNegativePnl += badDebt;
        }
        if (feeUsdc > available + gain) {
            uint256 feeDebt = feeUsdc - (available + gain);
            badDebt += feeDebt;
            protocolBadDebt += feeDebt;
            pendingNegativePnl += feeDebt;
        }
        if (payout > 0) {
            freeCollateral[trader] += payout;
            totalFreeCollateral += payout;
        }
        if (gain > 0) {
            realizedTraderPnlGains += gain;
            pendingPositivePnl = pendingPositivePnl > gain ? pendingPositivePnl - gain : 0;
        }
        if (loss > 0) realizedTraderPnlLosses += loss > collateral ? collateral : loss;
        emit PositionSettled(trader, collateral, netPnlUsdWad, badDebt);
    }

    function settlePartialWad(
        address trader,
        uint256 positionCollateral,
        uint256 collateralReleased,
        int256 netPnlUsdWad,
        uint256 feeUsdc
    )
        external
        onlyEngine
        returns (uint256 payoutUsdc, uint256 badDebt, uint256 remainingCollateral)
    {
        if (
            lockedCollateral[trader] < positionCollateral || collateralReleased > positionCollateral
        ) {
            revert InsufficientLockedCollateral();
        }
        uint256 gain = 0;
        uint256 loss = 0;
        if (netPnlUsdWad >= 0) {
            gain = FixedPointMath.usdWadToUsdcDown(SafeCast.toUint256(netPnlUsdWad));
        } else {
            loss = FixedPointMath.usdWadToUsdcUp(_negativeInt(netPnlUsdWad));
        }
        if (netPnlUsdWad >= 0) {
            uint256 grossPayout = collateralReleased + gain;
            uint256 feeCollected = feeUsdc > grossPayout ? grossPayout : feeUsdc;
            payoutUsdc = grossPayout - feeCollected;
            uint256 remainingBeforeFee = positionCollateral - collateralReleased;
            uint256 feeRemainder = feeUsdc - feeCollected;
            if (feeRemainder >= remainingBeforeFee) {
                remainingCollateral = 0;
                if (feeRemainder > remainingBeforeFee) {
                    badDebt = feeRemainder - remainingBeforeFee;
                }
            } else {
                remainingCollateral = remainingBeforeFee - feeRemainder;
            }
            if (feeCollected > 0) accruedFees += feeCollected;
            if (feeRemainder > badDebt) accruedFees += feeRemainder - badDebt;
        } else {
            uint256 debit = loss + feeUsdc;
            uint256 consumed = debit > positionCollateral ? positionCollateral : debit;
            uint256 requiredFromPosition =
                consumed > collateralReleased ? consumed : collateralReleased;
            remainingCollateral = positionCollateral - requiredFromPosition;
            payoutUsdc = collateralReleased > consumed ? collateralReleased - consumed : 0;
            if (debit > positionCollateral) badDebt = debit - positionCollateral;
            uint256 feePaid = positionCollateral > loss ? positionCollateral - loss : 0;
            if (feePaid > feeUsdc) feePaid = feeUsdc;
            if (feePaid > 0) accruedFees += feePaid;
        }
        lockedCollateral[trader] -= positionCollateral - remainingCollateral;
        totalLockedCollateral -= positionCollateral - remainingCollateral;
        if (badDebt > 0) {
            protocolBadDebt += badDebt;
            pendingNegativePnl += badDebt;
        }
        if (payoutUsdc > 0) {
            freeCollateral[trader] += payoutUsdc;
            totalFreeCollateral += payoutUsdc;
        }
        if (gain > 0) {
            realizedTraderPnlGains += gain;
            pendingPositivePnl = pendingPositivePnl > gain ? pendingPositivePnl - gain : 0;
        }
        if (loss > 0) {
            realizedTraderPnlLosses += loss > positionCollateral ? positionCollateral : loss;
        }
        emit PartialPositionSettled(trader, collateralReleased, netPnlUsdWad, feeUsdc, payoutUsdc);
    }

    function settleLiquidationWad(
        address trader,
        uint256 collateral,
        int256 netPnlUsdWad,
        uint256 liquidatorRewardUsdc,
        address liquidator
    )
        external
        onlyEngine
        returns (uint256 badDebt, uint256 liquidatorRewardPaid, uint256 residualUsdc)
    {
        if (liquidator == address(0) || lockedCollateral[trader] < collateral) {
            revert InvalidSettlement();
        }
        lockedCollateral[trader] -= collateral;
        totalLockedCollateral -= collateral;
        uint256 gain = 0;
        uint256 loss = 0;
        if (netPnlUsdWad >= 0) {
            gain = FixedPointMath.usdWadToUsdcDown(SafeCast.toUint256(netPnlUsdWad));
        } else {
            loss = FixedPointMath.usdWadToUsdcUp(_negativeInt(netPnlUsdWad));
        }
        if (loss > collateral) {
            badDebt = loss - collateral;
            protocolBadDebt += badDebt;
            pendingNegativePnl += badDebt;
        }
        uint256 equity = loss >= collateral ? 0 : collateral - loss + gain;
        liquidatorRewardPaid = liquidatorRewardUsdc > equity ? equity : liquidatorRewardUsdc;
        residualUsdc = equity - liquidatorRewardPaid;
        if (liquidatorRewardPaid > 0) {
            freeCollateral[liquidator] += liquidatorRewardPaid;
            totalFreeCollateral += liquidatorRewardPaid;
        }
        if (residualUsdc > 0) {
            freeCollateral[trader] += residualUsdc;
            totalFreeCollateral += residualUsdc;
        }
        if (gain > 0) {
            realizedTraderPnlGains += gain;
            pendingPositivePnl = pendingPositivePnl > gain ? pendingPositivePnl - gain : 0;
        }
        if (loss > 0) realizedTraderPnlLosses += loss > collateral ? collateral : loss;
        emit LiquidationSettled(
            trader,
            liquidator,
            collateral,
            netPnlUsdWad,
            liquidatorRewardPaid,
            residualUsdc,
            badDebt
        );
    }

    function receiveInsuranceCoverage(uint256 amount) external onlyEngine {
        if (amount == 0) return;
        rawCash += amount;
        insuranceCoveredBadDebt += amount;
        pendingNegativePnl = pendingNegativePnl > amount ? pendingNegativePnl - amount : 0;
        emit InsuranceCoverageReceived(amount);
    }

    function withdrawableLiquidity() public view returns (uint256) {
        uint256 liabilities = totalFreeCollateral + totalLockedCollateral + pendingPositivePnl;
        if (rawCash <= liabilities) return 0;
        return rawCash - liabilities;
    }

    function actualCustodyUsdc() public view returns (uint256) {
        if (address(_collateralToken) == address(0)) return 0;
        return _collateralToken.balanceOf(address(this));
    }

    function expectedCustodyUsdc() public view returns (uint256) {
        return rawCash;
    }

    function reconcileCustody()
        external
        view
        returns (CustodyStatus status, uint256 actual, uint256 expected, uint256 difference)
    {
        actual = actualCustodyUsdc();
        expected = expectedCustodyUsdc();
        if (actual == expected) return (CustodyStatus.MATCH, actual, expected, 0);
        if (actual > expected) return (CustodyStatus.SURPLUS, actual, expected, actual - expected);
        return (CustodyStatus.DEFICIT, actual, expected, expected - actual);
    }

    function totalAccountedAssets() external view returns (uint256) {
        return rawCash + pendingNegativePnl;
    }

    function _negativeInt(int256 value) private pure returns (uint256) {
        return SafeCast.magnitude(value);
    }
}
