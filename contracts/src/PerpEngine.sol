// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { FixedPointMath } from "./FixedPointMath.sol";
import { IInsuranceFund } from "./interfaces/IInsuranceFund.sol";
import { IMarketRegistry } from "./interfaces/IMarketRegistry.sol";
import { IOracleRouter } from "./interfaces/IOracleRouter.sol";
import { IRiskConfig } from "./interfaces/IRiskConfig.sol";
import { IUSDCMarginVault } from "./interfaces/IUSDCMarginVault.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeCast } from "./SafeCast.sol";

/**
 * V1 isolated position engine.
 *
 * The legacy `Position` tuple is retained for Gate 1 compatibility. `PositionState` is
 * the explicit fixed-point economic state used by Gate 3 and later settlement modules.
 * A single account+market may have only one net position; flipping requires reduction to
 * zero first. The close/liquidation formulas are intentionally small and auditable.
 */
contract PerpEngine is AccessControlled, ReentrancyGuard {
    uint256 public constant WAD = 1e18;

    struct Position {
        address trader;
        bytes32 marketId;
        bool isLong;
        uint256 collateral;
        uint256 size;
        uint256 entryPrice;
        bool open;
    }

    struct PositionState {
        address account;
        bytes32 marketId;
        bool isLong;
        uint256 sizeUsdWad;
        uint256 collateralUsdc;
        uint256 entryPriceWad;
        int256 entryFundingIndex;
        uint256 entryBorrowIndex;
        uint64 openedAt;
        uint64 lastIncreasedAt;
    }

    IMarketRegistry public immutable marketRegistry;
    IRiskConfig public immutable riskConfig;
    IOracleRouter public immutable oracleRouter;
    IUSDCMarginVault public immutable marginVault;
    IInsuranceFund public immutable insuranceFund;
    mapping(uint256 positionId => Position position) public positions;
    mapping(uint256 positionId => PositionState position) public positionStates;
    mapping(bytes32 accountMarket => uint256 positionId) public activePosition;
    mapping(bytes32 marketId => uint256 openInterest) public totalOpenInterest;
    mapping(address keeper => bool enabled) public liquidationKeeper;
    uint256 public nextPositionId = 1;

    error MarketCannotIncreaseExposure();
    error MarketCannotReduceExposure();
    error InvalidPosition();
    error InvalidSize();
    error MaxPositionExceeded();
    error MaxOIExceeded();
    error MaxLeverageExceeded();
    error UnauthorizedKeeper();
    error ExistingPosition();
    error InvalidOracleReport();

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        bytes32 indexed marketId,
        bool isLong,
        uint256 collateral,
        uint256 size,
        uint256 entryPrice
    );
    event PositionIncreased(uint256 indexed positionId, uint256 collateralAdded, uint256 sizeAdded);
    event PositionReduced(
        uint256 indexed positionId, uint256 collateralReleased, uint256 sizeReduced
    );
    event PositionLiquidated(uint256 indexed positionId, int256 pnl, uint256 badDebt);
    event LiquidationKeeperSet(address indexed keeper, bool enabled);

    modifier onlyKeeper() {
        if (!liquidationKeeper[msg.sender] && msg.sender != owner) revert UnauthorizedKeeper();
        _;
    }

    constructor(
        address marketRegistry_,
        address riskConfig_,
        address oracleRouter_,
        address marginVault_,
        address insuranceFund_
    ) {
        if (
            marketRegistry_ == address(0) || riskConfig_ == address(0)
                || oracleRouter_ == address(0) || marginVault_ == address(0)
                || insuranceFund_ == address(0)
        ) revert ZeroAddress();
        marketRegistry = IMarketRegistry(marketRegistry_);
        riskConfig = IRiskConfig(riskConfig_);
        oracleRouter = IOracleRouter(oracleRouter_);
        marginVault = IUSDCMarginVault(marginVault_);
        insuranceFund = IInsuranceFund(insuranceFund_);
    }

    function setLiquidationKeeper(address keeper, bool enabled) external onlyOwner {
        if (keeper == address(0)) revert ZeroAddress();
        liquidationKeeper[keeper] = enabled;
        emit LiquidationKeeperSet(keeper, enabled);
    }

    function openPosition(bytes32 marketId, bool isLong, uint256 collateral, uint256 size)
        external
        nonReentrant
        returns (uint256 positionId)
    {
        _requireCanIncrease(marketId);
        if (collateral == 0 || size == 0) revert InvalidSize();
        bytes32 accountMarket = _accountMarket(msg.sender, marketId);
        if (activePosition[accountMarket] != 0) revert ExistingPosition();
        IRiskConfig.Config memory config = riskConfig.getConfig(marketId);
        if (size > config.maxPosition) revert MaxPositionExceeded();
        if (totalOpenInterest[marketId] + size > config.maxOI) revert MaxOIExceeded();
        _assertLeverage(size, collateral, config.maxLeverage);
        (uint256 price, uint64 observedAt, uint256 confidenceBps) =
            oracleRouter.getUsablePrice(marketId);
        if (observedAt == 0 || confidenceBps == 0) revert InvalidOracleReport();
        positionId = nextPositionId++;
        positions[positionId] =
            Position(msg.sender, marketId, isLong, collateral, size, price, true);
        uint64 now64 = SafeCast.toUint64(block.timestamp);
        positionStates[positionId] = PositionState({
            account: msg.sender,
            marketId: marketId,
            isLong: isLong,
            sizeUsdWad: size * WAD,
            collateralUsdc: collateral,
            entryPriceWad: price,
            entryFundingIndex: 0,
            entryBorrowIndex: 0,
            openedAt: now64,
            lastIncreasedAt: now64
        });
        totalOpenInterest[marketId] += size;
        activePosition[accountMarket] = positionId;
        emit PositionOpened(positionId, msg.sender, marketId, isLong, collateral, size, price);
        // State is finalized before the external vault call. A revert rolls back both.
        // ReentrancyGuard is held until the external vault call returns; state is already final.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        marginVault.lockCollateral(msg.sender, collateral);
    }

    function increasePosition(uint256 positionId, uint256 collateralAdded, uint256 sizeAdded)
        external
        nonReentrant
    {
        Position storage position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        _requireCanIncrease(position.marketId);
        if (sizeAdded == 0) revert InvalidSize();
        IRiskConfig.Config memory config = riskConfig.getConfig(position.marketId);
        uint256 newSize = position.size + sizeAdded;
        uint256 newCollateral = position.collateral + collateralAdded;
        if (newSize > config.maxPosition) revert MaxPositionExceeded();
        if (totalOpenInterest[position.marketId] + sizeAdded > config.maxOI) {
            revert MaxOIExceeded();
        }
        _assertLeverage(newSize, newCollateral, config.maxLeverage);
        (uint256 markPrice, uint64 observedAt, uint256 confidenceBps) =
            oracleRouter.getUsablePrice(position.marketId);
        if (observedAt == 0 || confidenceBps == 0) revert InvalidOracleReport();
        position.size = newSize;
        position.collateral = newCollateral;
        PositionState storage state = positionStates[positionId];
        state.sizeUsdWad = newSize * WAD;
        state.collateralUsdc = newCollateral;
        state.entryPriceWad = markPrice;
        state.lastIncreasedAt = SafeCast.toUint64(block.timestamp);
        totalOpenInterest[position.marketId] += sizeAdded;
        emit PositionIncreased(positionId, collateralAdded, sizeAdded);
        if (collateralAdded > 0) {
            // ReentrancyGuard is held until the external vault call returns; state is already final.
            // forge-lint: disable-next-line(reentrancy-no-eth)
            marginVault.lockCollateral(msg.sender, collateralAdded);
        }
    }

    function reducePosition(uint256 positionId, uint256 sizeReduced, uint256 collateralReleased)
        external
        nonReentrant
    {
        Position storage position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        if (!marketRegistry.canReduceExposure(position.marketId)) {
            revert MarketCannotReduceExposure();
        }
        if (
            sizeReduced == 0 || sizeReduced > position.size
                || collateralReleased > position.collateral
        ) revert InvalidSize();
        if (sizeReduced == position.size && collateralReleased != position.collateral) {
            revert InvalidSize();
        }
        position.size -= sizeReduced;
        position.collateral -= collateralReleased;
        PositionState storage state = positionStates[positionId];
        state.sizeUsdWad -= sizeReduced * WAD;
        state.collateralUsdc -= collateralReleased;
        totalOpenInterest[position.marketId] -= sizeReduced;
        if (position.size == 0) {
            position.open = false;
            activePosition[_accountMarket(msg.sender, position.marketId)] = 0;
        }
        emit PositionReduced(positionId, collateralReleased, sizeReduced);
        // ReentrancyGuard is held until the external vault call returns; state is already final.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        marginVault.unlockCollateral(msg.sender, collateralReleased);
    }

    /**
     * Gate 1-compatible explicit settlement hook used by bad-debt accounting tests.
     */
    function liquidatePosition(uint256 positionId, int256 settlementPnl)
        external
        nonReentrant
        onlyKeeper
    {
        Position storage position = positions[positionId];
        if (!position.open) revert InvalidPosition();
        (uint256 markPrice, uint64 observedAt, uint256 confidenceBps) =
            oracleRouter.getUsablePrice(position.marketId);
        if (markPrice == 0 || observedAt == 0 || confidenceBps == 0) {
            revert InvalidOracleReport();
        }
        uint256 collateral = position.collateral;
        bytes32 accountMarket = _accountMarket(position.trader, position.marketId);
        totalOpenInterest[position.marketId] -= position.size;
        activePosition[accountMarket] = 0;
        position.open = false;
        position.size = 0;
        position.collateral = 0;
        positionStates[positionId].sizeUsdWad = 0;
        positionStates[positionId].collateralUsdc = 0;
        emit PositionLiquidated(positionId, settlementPnl, 0);
        // ReentrancyGuard is held; the position and OI were closed before settlement.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        uint256 badDebt = marginVault.settlePosition(position.trader, collateral, settlementPnl);
        if (badDebt > 0) {
            // Insurance authorization is reached only after the position is closed.
            // forge-lint: disable-next-line(reentrancy-no-eth)
            insuranceFund.recordBadDebt(badDebt);
        }
    }

    function closePosition(uint256 positionId) external nonReentrant returns (uint256 badDebt) {
        Position storage position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        if (!marketRegistry.canReduceExposure(position.marketId)) {
            revert MarketCannotReduceExposure();
        }
        uint256 collateral = position.collateral;
        uint256 price = oracleRouter.getExecutionPrice(position.marketId, position.isLong, false);
        int256 pnl = FixedPointMath.directionalPnl(
            position.isLong, position.size * WAD, position.entryPrice, price
        );
        totalOpenInterest[position.marketId] -= position.size;
        activePosition[_accountMarket(msg.sender, position.marketId)] = 0;
        position.open = false;
        position.size = 0;
        position.collateral = 0;
        positionStates[positionId].sizeUsdWad = 0;
        positionStates[positionId].collateralUsdc = 0;
        emit PositionLiquidated(positionId, pnl, 0);
        // ReentrancyGuard is held; the position and OI were closed before settlement.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        badDebt = marginVault.settlePosition(msg.sender, collateral, pnl);
        if (badDebt > 0) {
            // forge-lint: disable-next-line(reentrancy-no-eth)
            insuranceFund.recordBadDebt(badDebt);
        }
    }

    function positionPnl(uint256 positionId, uint256 exitPrice) external view returns (int256) {
        Position memory position = positions[positionId];
        if (!position.open) revert InvalidPosition();
        return FixedPointMath.directionalPnl(
            position.isLong, position.size * WAD, position.entryPrice, exitPrice
        );
    }

    function _requireCanIncrease(bytes32 marketId) private view {
        if (
            !marketRegistry.canIncreaseExposure(marketId)
                || !riskConfig.canIncreaseExposure(marketId)
        ) {
            revert MarketCannotIncreaseExposure();
        }
    }

    function _assertLeverage(uint256 size, uint256 collateral, uint256 maxLeverage) private pure {
        if (collateral == 0 || FixedPointMath.mulDivDown(size, WAD, collateral) > maxLeverage) {
            revert MaxLeverageExceeded();
        }
    }

    function _accountMarket(address account, bytes32 marketId) private pure returns (bytes32) {
        return keccak256(abi.encode(account, marketId));
    }
}
