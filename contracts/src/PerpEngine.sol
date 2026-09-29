// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IInsuranceFund} from "./interfaces/IInsuranceFund.sol";
import {IMarketRegistry} from "./interfaces/IMarketRegistry.sol";
import {IOracleRouter} from "./interfaces/IOracleRouter.sol";
import {IRiskConfig} from "./interfaces/IRiskConfig.sol";
import {IUSDCMarginVault} from "./interfaces/IUSDCMarginVault.sol";

contract PerpEngine is AccessControlled {
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

    IMarketRegistry public immutable marketRegistry;
    IRiskConfig public immutable riskConfig;
    IOracleRouter public immutable oracleRouter;
    IUSDCMarginVault public immutable marginVault;
    IInsuranceFund public immutable insuranceFund;
    mapping(uint256 positionId => Position position) public positions;
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

    event PositionOpened(uint256 indexed positionId, address indexed trader, bytes32 indexed marketId, bool isLong, uint256 collateral, uint256 size, uint256 entryPrice);
    event PositionIncreased(uint256 indexed positionId, uint256 collateralAdded, uint256 sizeAdded);
    event PositionReduced(uint256 indexed positionId, uint256 collateralReleased, uint256 sizeReduced);
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
            marketRegistry_ == address(0) || riskConfig_ == address(0) || oracleRouter_ == address(0)
                || marginVault_ == address(0) || insuranceFund_ == address(0)
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
        returns (uint256 positionId)
    {
        if (!marketRegistry.canIncreaseExposure(marketId) || !riskConfig.canIncreaseExposure(marketId)) {
            revert MarketCannotIncreaseExposure();
        }
        if (collateral == 0 || size == 0) revert InvalidSize();
        IRiskConfig.Config memory config = riskConfig.getConfig(marketId);
        if (size > config.maxPosition) revert MaxPositionExceeded();
        if (totalOpenInterest[marketId] + size > config.maxOI) revert MaxOIExceeded();
        _assertLeverage(size, collateral, config.maxLeverage);
        (uint256 price,,) = oracleRouter.getUsablePrice(marketId);
        marginVault.lockCollateral(msg.sender, collateral);
        positionId = nextPositionId++;
        positions[positionId] = Position(msg.sender, marketId, isLong, collateral, size, price, true);
        totalOpenInterest[marketId] += size;
        emit PositionOpened(positionId, msg.sender, marketId, isLong, collateral, size, price);
    }

    function increasePosition(uint256 positionId, uint256 collateralAdded, uint256 sizeAdded)
        external
    {
        Position storage position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        if (!marketRegistry.canIncreaseExposure(position.marketId) || !riskConfig.canIncreaseExposure(position.marketId)) {
            revert MarketCannotIncreaseExposure();
        }
        if (sizeAdded == 0) revert InvalidSize();
        IRiskConfig.Config memory config = riskConfig.getConfig(position.marketId);
        uint256 newSize = position.size + sizeAdded;
        uint256 newCollateral = position.collateral + collateralAdded;
        if (newSize > config.maxPosition) revert MaxPositionExceeded();
        if (totalOpenInterest[position.marketId] + sizeAdded > config.maxOI) revert MaxOIExceeded();
        _assertLeverage(newSize, newCollateral, config.maxLeverage);
        oracleRouter.getUsablePrice(position.marketId);
        if (collateralAdded > 0) marginVault.lockCollateral(msg.sender, collateralAdded);
        position.size = newSize;
        position.collateral = newCollateral;
        totalOpenInterest[position.marketId] += sizeAdded;
        emit PositionIncreased(positionId, collateralAdded, sizeAdded);
    }

    function reducePosition(uint256 positionId, uint256 sizeReduced, uint256 collateralReleased)
        external
    {
        Position storage position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        if (!marketRegistry.canReduceExposure(position.marketId)) revert MarketCannotReduceExposure();
        if (sizeReduced == 0 || sizeReduced > position.size || collateralReleased > position.collateral) {
            revert InvalidSize();
        }
        if (sizeReduced == position.size && collateralReleased != position.collateral) revert InvalidSize();
        position.size -= sizeReduced;
        position.collateral -= collateralReleased;
        totalOpenInterest[position.marketId] -= sizeReduced;
        marginVault.unlockCollateral(msg.sender, collateralReleased);
        if (position.size == 0) position.open = false;
        emit PositionReduced(positionId, collateralReleased, sizeReduced);
    }

    /**
     * Liquidation settlement is an explicit hook. The final mark/PnL, funding, and penalty
     * formulas remain TODO and are supplied by the future liquidation/risk module.
     */
    function liquidatePosition(uint256 positionId, int256 settlementPnl) external onlyKeeper {
        Position storage position = positions[positionId];
        if (!position.open) revert InvalidPosition();
        oracleRouter.getUsablePrice(position.marketId);
        uint256 badDebt = marginVault.settlePosition(position.trader, position.collateral, settlementPnl);
        if (badDebt > 0) insuranceFund.recordBadDebt(badDebt);
        totalOpenInterest[position.marketId] -= position.size;
        position.open = false;
        position.size = 0;
        position.collateral = 0;
        emit PositionLiquidated(positionId, settlementPnl, badDebt);
    }

    function _assertLeverage(uint256 size, uint256 collateral, uint256 maxLeverage) private pure {
        if (collateral == 0 || size * WAD / collateral > maxLeverage) revert MaxLeverageExceeded();
    }
}
