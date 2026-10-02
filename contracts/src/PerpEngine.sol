// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { EconomicModel } from "./EconomicModel.sol";
import { FixedPointMath } from "./FixedPointMath.sol";
import { IInsuranceFund } from "./interfaces/IInsuranceFund.sol";
import { IMarketRegistry } from "./interfaces/IMarketRegistry.sol";
import { IOracleRouter } from "./interfaces/IOracleRouter.sol";
import { IRiskConfig } from "./interfaces/IRiskConfig.sol";
import { IUSDCMarginVault } from "./interfaces/IUSDCMarginVault.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeCast } from "./SafeCast.sol";

/**
 * V1 isolated economic engine.
 *
 * Notional and collateral at the external API boundary are USDC base units (6 decimals).
 * Price, PnL, funding, and borrow indexes are WAD fixed point. There is one net position
 * per account and market. The direct methods remain useful for controlled local tests; the
 * production execution boundary is the two-phase order path below.
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

    enum Action {
        OPEN,
        INCREASE,
        DECREASE,
        CLOSE
    }

    struct OrderIntent {
        address account;
        bytes32 marketId;
        Action action;
        bool isLong;
        uint256 sizeDelta;
        uint256 collateralDelta;
        uint256 acceptablePrice;
        uint64 createdAt;
        uint64 expiry;
        uint256 nonce;
        bool executed;
        bool cancelled;
    }

    struct MarketAccrual {
        int256 fundingIndexWad;
        uint256 borrowIndexWad;
        uint64 lastUpdatedAt;
    }

    struct FeeConfig {
        uint256 openFeeRateWad;
        uint256 closeFeeRateWad;
        uint256 insuranceShareBps;
    }

    struct SideCaps {
        uint256 maxLong;
        uint256 maxShort;
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
    mapping(bytes32 marketId => uint256 longOpenInterest) public longOpenInterest;
    mapping(bytes32 marketId => uint256 shortOpenInterest) public shortOpenInterest;
    mapping(bytes32 marketId => SideCaps caps) public sideCaps;
    mapping(bytes32 marketId => MarketAccrual accrual) public marketAccrual;
    mapping(bytes32 orderId => OrderIntent intent) public orders;
    mapping(address account => uint256 nonce) public nextOrderNonce;
    mapping(address keeper => bool enabled) public liquidationKeeper;
    mapping(address keeper => bool enabled) public orderKeeper;
    uint256 public nextPositionId = 1;
    address public adlController;

    EconomicModel.FundingConfig public fundingConfig;
    EconomicModel.BorrowConfig public borrowConfig;
    FeeConfig public feeConfig;
    uint256 public liquidationRewardUsdc;
    uint256 public maxSkewRatioWad = WAD;
    uint256 public worseningSkewFeeRateWad;

    error MarketCannotIncreaseExposure();
    error MarketCannotReduceExposure();
    error InvalidPosition();
    error InvalidSize();
    error MaxPositionExceeded();
    error MaxOIExceeded();
    error MaxLeverageExceeded();
    error UnauthorizedKeeper();
    error UnauthorizedOrderKeeper();
    error ExistingPosition();
    error InvalidOracleReport();
    error AccruedCostExceedsCollateral();
    error NotLiquidatable();
    error InvalidOrder();
    error OrderNotFound();
    error OrderExpired();
    error OrderAlreadyFinalized();
    error UnauthorizedOrder();
    error PriceOutsideBound();
    error InvalidEconomicConfig();
    error InvalidSideCaps();
    error SkewCapExceeded();
    error InsufficientVaultCapacity();
    error LegacyPathDisabled();
    error InvalidSettlementOutcome();
    error UnauthorizedADLController();
    error InvalidADLPrice();

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
    event PositionClosed(uint256 indexed positionId, int256 pnl, uint256 badDebt);
    event PositionLiquidated(uint256 indexed positionId, int256 pnl, uint256 badDebt);
    event LiquidationKeeperSet(address indexed keeper, bool enabled);
    event OrderKeeperSet(address indexed keeper, bool enabled);
    event OrderSubmitted(
        bytes32 indexed orderId, address indexed account, bytes32 indexed marketId, uint256 nonce
    );
    event OrderCancelled(bytes32 indexed orderId, address indexed account);
    event OrderExecuted(bytes32 indexed orderId, uint256 executionPrice, uint64 oracleSequence);
    event MarketAccrualUpdated(
        bytes32 indexed marketId, int256 fundingIndexWad, uint256 borrowIndexWad, uint64 timestamp
    );
    event EconomicConfigUpdated();
    event SideCapsSet(bytes32 indexed marketId, uint256 maxLong, uint256 maxShort);
    event SkewConfigSet(uint256 maxSkewRatioWad, uint256 worseningFeeRateWad);
    event SkewFeeCharged(uint256 indexed positionId, uint256 amount);
    event BadDebtCoverageApplied(uint256 badDebt, uint256 covered, uint256 uncovered);
    event LiquidationOutcome(uint256 indexed positionId, uint256 reward, uint256 residual);
    event PartialSettlementOutcome(uint256 indexed positionId, uint256 payout, uint256 badDebt);
    event ADLControllerSet(address indexed controller);
    event ADLPositionReduced(
        uint256 indexed positionId, uint256 sizeReduced, uint256 executionPrice
    );

    modifier onlyKeeper() {
        if (!liquidationKeeper[msg.sender] && !(!bootstrapFinalized && msg.sender == owner)) {
            revert UnauthorizedKeeper();
        }
        _;
    }

    modifier onlyOrderKeeper() {
        if (!orderKeeper[msg.sender] && !(!bootstrapFinalized && msg.sender == owner)) {
            revert UnauthorizedOrderKeeper();
        }
        _;
    }

    modifier onlyADLController() {
        if (msg.sender != adlController) revert UnauthorizedADLController();
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
        fundingConfig = EconomicModel.FundingConfig({
            factorPerSecondWad: 1e12, capPerSecondWad: 1e13, minimumDenominatorUsdWad: WAD
        });
        borrowConfig = EconomicModel.BorrowConfig({
            baseRatePerSecondWad: 0,
            slopePerSecondWad: 1e9,
            kinkUtilizationWad: 8e17,
            maxRatePerSecondWad: 2_500_000_000
        });
    }

    function setLiquidationKeeper(address keeper, bool enabled) external onlyGovernanceExecutor {
        if (keeper == address(0)) revert ZeroAddress();
        liquidationKeeper[keeper] = enabled;
        emit LiquidationKeeperSet(keeper, enabled);
    }

    function setOrderKeeper(address keeper, bool enabled) external onlyGovernanceExecutor {
        if (keeper == address(0)) revert ZeroAddress();
        orderKeeper[keeper] = enabled;
        emit OrderKeeperSet(keeper, enabled);
    }

    function setADLController(address controller) external onlyGovernanceExecutor {
        if (controller == address(0)) revert ZeroAddress();
        adlController = controller;
        emit ADLControllerSet(controller);
    }

    function adlReducePosition(uint256 positionId, uint256 sizeReduced, uint256 executionPrice)
        external
        nonReentrant
        onlyADLController
    {
        Position memory position = positions[positionId];
        if (!position.open || sizeReduced == 0 || sizeReduced > position.size) {
            revert InvalidPosition();
        }
        // ADL is an emergency path, but it may not turn a controller-supplied price
        // into discretionary value transfer. The engine owns the canonical conservative
        // oracle boundary and requires the controller input to match it exactly.
        uint256 canonicalPrice = _executionPrice(position.marketId, position.isLong, false);
        if (executionPrice != canonicalPrice) revert InvalidADLPrice();
        uint256 collateralReleased = sizeReduced == position.size ? position.collateral : 0;
        _reduceFor(positionId, sizeReduced, collateralReleased, executionPrice);
        // _reduceFor finalizes OI and position state before guarded settlement calls.
        emit ADLPositionReduced(positionId, sizeReduced, executionPrice);
    }

    function setEconomicConfig(
        EconomicModel.FundingConfig calldata funding,
        EconomicModel.BorrowConfig calldata borrow,
        FeeConfig calldata fees,
        uint256 liquidationRewardUsdc_
    ) external onlyGovernanceExecutor {
        if (
            funding.capPerSecondWad == 0 || funding.factorPerSecondWad > funding.capPerSecondWad
                || borrow.maxRatePerSecondWad == 0 || borrow.kinkUtilizationWad > WAD
                || fees.openFeeRateWad > WAD || fees.closeFeeRateWad > WAD
                || fees.insuranceShareBps > 10_000
        ) revert InvalidEconomicConfig();
        fundingConfig = funding;
        borrowConfig = borrow;
        feeConfig = fees;
        liquidationRewardUsdc = liquidationRewardUsdc_;
        emit EconomicConfigUpdated();
    }

    function setMarketSideCaps(bytes32 marketId, uint256 maxLong, uint256 maxShort)
        external
        onlyGovernanceExecutor
    {
        IRiskConfig.Config memory config = riskConfig.getConfig(marketId);
        if (maxLong == 0 || maxShort == 0 || maxLong > config.maxOI || maxShort > config.maxOI) {
            revert InvalidSideCaps();
        }
        sideCaps[marketId] = SideCaps(maxLong, maxShort);
        emit SideCapsSet(marketId, maxLong, maxShort);
    }

    function setSkewConfig(uint256 maxSkewRatioWad_, uint256 worseningFeeRateWad_)
        external
        onlyGovernanceExecutor
    {
        if (maxSkewRatioWad_ > WAD || worseningFeeRateWad_ > WAD) {
            revert InvalidEconomicConfig();
        }
        maxSkewRatioWad = maxSkewRatioWad_;
        worseningSkewFeeRateWad = worseningFeeRateWad_;
        emit SkewConfigSet(maxSkewRatioWad_, worseningFeeRateWad_);
    }

    function openPosition(bytes32 marketId, bool isLong, uint256 collateral, uint256 size)
        external
        nonReentrant
        returns (uint256 positionId)
    {
        _requireCanIncrease(marketId);
        uint256 price = _executionPrice(marketId, isLong, true);
        positionId = _openFor(msg.sender, marketId, isLong, collateral, size, price);
    }

    function increasePosition(uint256 positionId, uint256 collateralAdded, uint256 sizeAdded)
        external
        nonReentrant
    {
        Position memory position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        _requireCanIncrease(position.marketId);
        uint256 price = _executionPrice(position.marketId, position.isLong, true);
        _increaseFor(positionId, collateralAdded, sizeAdded, price);
    }

    function reducePosition(uint256 positionId, uint256 sizeReduced, uint256 collateralReleased)
        external
        nonReentrant
    {
        Position memory position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        if (!marketRegistry.canReduceExposure(position.marketId)) {
            revert MarketCannotReduceExposure();
        }
        uint256 price = _executionPrice(position.marketId, position.isLong, false);
        _reduceFor(positionId, sizeReduced, collateralReleased, price);
    }

    /**
     * Gate 1-compatible explicit settlement hook; pnl is raw USDC units.
     */
    function liquidatePosition(uint256 positionId, int256 settlementPnl)
        external
        nonReentrant
        onlyKeeper
    {
        if (marginVault.collateralToken() != address(0)) revert LegacyPathDisabled();
        Position memory position = positions[positionId];
        if (!position.open) revert InvalidPosition();
        _removePosition(positionId, position);
        emit PositionLiquidated(positionId, settlementPnl, 0);
        // State is complete and the public entrypoint holds ReentrancyGuard.
        uint256 badDebt =
            marginVault.settlePosition(position.trader, position.collateral, settlementPnl);
        if (badDebt > 0) {
            // Compatibility path is retained for deterministic Gate 1 accounting tests.
            insuranceFund.recordBadDebt(badDebt);
        }
    }

    function closePosition(uint256 positionId) external nonReentrant returns (uint256 badDebt) {
        Position memory position = positions[positionId];
        if (!position.open || position.trader != msg.sender) revert InvalidPosition();
        if (!marketRegistry.canReduceExposure(position.marketId)) {
            revert MarketCannotReduceExposure();
        }
        uint256 price = _executionPrice(position.marketId, position.isLong, false);
        badDebt = _closeFor(positionId, price, msg.sender);
    }

    function liquidate(uint256 positionId) external nonReentrant onlyKeeper {
        Position memory position = positions[positionId];
        if (!position.open) revert InvalidPosition();
        if (!marketRegistry.canReduceExposure(position.marketId)) {
            revert MarketCannotReduceExposure();
        }
        _updateMarketAccrual(position.marketId);
        PositionState memory state = positionStates[positionId];
        uint256 price = _executionPrice(position.marketId, position.isLong, false);
        int256 netPnl = _netPnl(state, price);
        IRiskConfig.Config memory config = riskConfig.getConfig(position.marketId);
        uint256 equity = _equityUsdc(position.collateral, netPnl);
        uint256 maintenance = (position.size * config.maintenanceMarginBps) / 10_000;
        if (equity > maintenance) revert NotLiquidatable();
        _removePosition(positionId, position);
        // State and OI are already removed before settlement.
        // State is complete and the public entrypoint holds ReentrancyGuard.
        (uint256 badDebt, uint256 reward, uint256 residual) = marginVault.settleLiquidationWad(
            position.trader, position.collateral, netPnl, liquidationRewardUsdc, msg.sender
        );
        if (badDebt > 0) _coverBadDebt(badDebt);
        emit LiquidationOutcome(positionId, reward, residual);
        emit PositionLiquidated(positionId, netPnl, badDebt);
    }

    function positionPnl(uint256 positionId, uint256 exitPrice) external view returns (int256) {
        PositionState memory state = positionStates[positionId];
        if (!positions[positionId].open) revert InvalidPosition();
        return FixedPointMath.directionalPnl(
            state.isLong, state.sizeUsdWad, state.entryPriceWad, exitPrice
        );
    }

    function positionAccruedCost(uint256 positionId) external view returns (int256) {
        PositionState memory state = positionStates[positionId];
        if (!positions[positionId].open) revert InvalidPosition();
        return _positionCost(state, marketAccrual[state.marketId]);
    }

    function submitOrder(
        bytes32 marketId,
        Action action,
        bool isLong,
        uint256 sizeDelta,
        uint256 collateralDelta,
        uint256 acceptablePrice,
        uint64 expiry
    ) external returns (bytes32 orderId) {
        uint64 currentTime = SafeCast.toUint64(block.timestamp);
        if (
            marketId == bytes32(0) || sizeDelta == 0 || acceptablePrice == 0
                || expiry <= currentTime
        ) revert InvalidOrder();
        uint256 nonce = nextOrderNonce[msg.sender]++;
        orderId = keccak256(
            abi.encode(
                msg.sender,
                marketId,
                action,
                isLong,
                sizeDelta,
                collateralDelta,
                acceptablePrice,
                expiry,
                nonce
            )
        );
        orders[orderId] = OrderIntent(
            msg.sender,
            marketId,
            action,
            isLong,
            sizeDelta,
            collateralDelta,
            acceptablePrice,
            currentTime,
            expiry,
            nonce,
            false,
            false
        );
        emit OrderSubmitted(orderId, msg.sender, marketId, nonce);
    }

    function cancelOrder(bytes32 orderId) external {
        OrderIntent storage order = orders[orderId];
        if (order.account == address(0)) revert OrderNotFound();
        if (order.account != msg.sender) revert UnauthorizedOrder();
        if (order.executed || order.cancelled) revert OrderAlreadyFinalized();
        order.cancelled = true;
        emit OrderCancelled(orderId, msg.sender);
    }

    function executeOrder(bytes32 orderId, uint64 oracleSequence)
        external
        nonReentrant
        onlyOrderKeeper
        returns (uint256 executionPrice)
    {
        OrderIntent storage order = orders[orderId];
        if (order.account == address(0)) revert OrderNotFound();
        if (order.executed || order.cancelled) revert OrderAlreadyFinalized();
        uint64 now64 = SafeCast.toUint64(block.timestamp);
        if (now64 > order.expiry) revert OrderExpired();
        IOracleRouter.OracleReport memory report = oracleRouter.getReport(order.marketId);
        if (report.sequence != oracleSequence || report.sequence == 0) revert OrderExpired();
        if (report.observedAt < order.createdAt || !oracleRouter.isReportUsable(order.marketId)) {
            revert OrderExpired();
        }
        bool opening = order.action == Action.OPEN || order.action == Action.INCREASE;
        executionPrice = oracleRouter.getExecutionPrice(order.marketId, order.isLong, opening);
        if (opening && executionPrice > order.acceptablePrice) revert PriceOutsideBound();
        if (!opening && executionPrice < order.acceptablePrice) revert PriceOutsideBound();

        // Mark consumed before any vault or insurance interaction. Reverts roll back this write.
        order.executed = true;
        emit OrderExecuted(orderId, executionPrice, report.sequence);
        if (order.action == Action.OPEN) {
            _openFor(
                order.account,
                order.marketId,
                order.isLong,
                order.collateralDelta,
                order.sizeDelta,
                executionPrice
            );
        } else {
            uint256 positionId = activePosition[_accountMarket(order.account, order.marketId)];
            if (positionId == 0) revert InvalidPosition();
            if (order.action == Action.INCREASE) {
                Position memory position = positions[positionId];
                if (position.isLong != order.isLong) revert InvalidPosition();
                _increaseFor(positionId, order.collateralDelta, order.sizeDelta, executionPrice);
            } else if (order.action == Action.DECREASE) {
                if (positions[positionId].isLong != order.isLong) revert InvalidPosition();
                _reduceFor(positionId, order.sizeDelta, order.collateralDelta, executionPrice);
            } else {
                if (positions[positionId].isLong != order.isLong) revert InvalidPosition();
                _closeFor(positionId, executionPrice, order.account);
            }
        }
    }

    function _openFor(
        address account,
        bytes32 marketId,
        bool isLong,
        uint256 collateral,
        uint256 size,
        uint256 price
    ) private returns (uint256 positionId) {
        if (collateral == 0 || size == 0) revert InvalidSize();
        _requireCanIncrease(marketId);
        bytes32 accountMarket = _accountMarket(account, marketId);
        if (activePosition[accountMarket] != 0) revert ExistingPosition();
        IRiskConfig.Config memory config = riskConfig.getConfig(marketId);
        if (size > config.maxPosition) revert MaxPositionExceeded();
        _enforceExposure(marketId, isLong, size, config.maxOI);
        _requireVaultCapacity(marketId, size);
        _assertLeverage(size, collateral, config.maxLeverage);
        _updateMarketAccrual(marketId);
        uint256 fee = _feeUsdc(size, feeConfig.openFeeRateWad);
        uint256 skewFee = _worseningSkewFee(marketId, isLong, size);
        fee += skewFee;
        positionId = nextPositionId++;
        uint64 now64 = SafeCast.toUint64(block.timestamp);
        Position memory newPosition =
            Position(account, marketId, isLong, collateral, size, price, true);
        positions[positionId] = newPosition;
        PositionState memory state = PositionState({
            account: account,
            marketId: marketId,
            isLong: isLong,
            sizeUsdWad: FixedPointMath.usdcToUsdWad(size),
            collateralUsdc: collateral,
            entryPriceWad: price,
            entryFundingIndex: marketAccrual[marketId].fundingIndexWad,
            entryBorrowIndex: marketAccrual[marketId].borrowIndexWad,
            openedAt: now64,
            lastIncreasedAt: now64
        });
        positionStates[positionId] = state;
        activePosition[accountMarket] = positionId;
        totalOpenInterest[marketId] += size;
        if (isLong) longOpenInterest[marketId] += size;
        else shortOpenInterest[marketId] += size;
        emit PositionOpened(positionId, account, marketId, isLong, collateral, size, price);
        if (skewFee > 0) emit SkewFeeCharged(positionId, skewFee);
        // State is finalized before the guarded external vault interactions.
        marginVault.lockCollateral(account, collateral);
        marginVault.collectFee(account, fee);
        if (fee > 0) _routeFee(fee);
    }

    function _increaseFor(
        uint256 positionId,
        uint256 collateralAdded,
        uint256 sizeAdded,
        uint256 price
    ) private {
        if (sizeAdded == 0) revert InvalidSize();
        Position storage position = positions[positionId];
        PositionState storage state = positionStates[positionId];
        _requireCanIncrease(position.marketId);
        uint256 previousCollateral = position.collateral;
        _updateMarketAccrual(position.marketId);
        int256 accruedCost = _positionCost(state, marketAccrual[position.marketId]);
        uint256 accruedCollateral = _collateralAfterAccrual(position.collateral, accruedCost);
        IRiskConfig.Config memory config = riskConfig.getConfig(position.marketId);
        uint256 newSize = position.size + sizeAdded;
        uint256 newCollateral = accruedCollateral + collateralAdded;
        if (newSize > config.maxPosition) revert MaxPositionExceeded();
        _enforceExposure(position.marketId, position.isLong, sizeAdded, config.maxOI);
        _requireVaultCapacity(position.marketId, sizeAdded);
        _assertLeverage(newSize, newCollateral, config.maxLeverage);
        uint256 fee = _feeUsdc(sizeAdded, feeConfig.openFeeRateWad);
        uint256 skewFee = _worseningSkewFee(position.marketId, position.isLong, sizeAdded);
        fee += skewFee;
        uint256 oldNotional = state.sizeUsdWad;
        uint256 addedNotional = FixedPointMath.usdcToUsdWad(sizeAdded);
        uint256 weightedEntry = (oldNotional * state.entryPriceWad + addedNotional * price)
            / (oldNotional + addedNotional);
        position.size = newSize;
        position.collateral = newCollateral;
        position.entryPrice = weightedEntry;
        state.sizeUsdWad = oldNotional + addedNotional;
        state.collateralUsdc = newCollateral;
        state.entryPriceWad = weightedEntry;
        state.entryFundingIndex = marketAccrual[position.marketId].fundingIndexWad;
        state.entryBorrowIndex = marketAccrual[position.marketId].borrowIndexWad;
        state.lastIncreasedAt = SafeCast.toUint64(block.timestamp);
        totalOpenInterest[position.marketId] += sizeAdded;
        if (position.isLong) longOpenInterest[position.marketId] += sizeAdded;
        else shortOpenInterest[position.marketId] += sizeAdded;
        emit PositionIncreased(positionId, collateralAdded, sizeAdded);
        if (skewFee > 0) emit SkewFeeCharged(positionId, skewFee);
        // Position/OI state is final before any external vault call. The returned value is
        // checked against the independently computed fixed-point result.
        // State is complete and the public entrypoint holds ReentrancyGuard.
        (uint256 vaultCollateral, uint256 accruedBadDebt) =
            marginVault.settleAccruedWad(position.trader, previousCollateral, accruedCost);
        if (accruedBadDebt > 0 || vaultCollateral != accruedCollateral) {
            revert AccruedCostExceedsCollateral();
        }
        marginVault.lockCollateral(position.trader, collateralAdded);
        marginVault.collectFee(position.trader, fee);
        if (fee > 0) _routeFee(fee);
    }

    function _reduceFor(
        uint256 positionId,
        uint256 sizeReduced,
        uint256 collateralReleased,
        uint256 price
    ) private {
        Position memory position = positions[positionId];
        if (
            sizeReduced == 0 || sizeReduced > position.size
                || collateralReleased > position.collateral
        ) revert InvalidSize();
        if (sizeReduced == position.size && collateralReleased != position.collateral) {
            revert InvalidSize();
        }
        _updateMarketAccrual(position.marketId);
        PositionState memory state = positionStates[positionId];
        MarketAccrual memory accrual = marketAccrual[position.marketId];
        uint256 reducedSizeWad = FixedPointMath.usdcToUsdWad(sizeReduced);
        int256 directional = FixedPointMath.directionalPnl(
            state.isLong, reducedSizeWad, state.entryPriceWad, price
        );
        int256 fundingDelta = accrual.fundingIndexWad - state.entryFundingIndex;
        if (!state.isLong) fundingDelta = -fundingDelta;
        int256 fundingCost = FixedPointMath.signedMulDiv(fundingDelta, reducedSizeWad, WAD);
        uint256 borrowDelta = accrual.borrowIndexWad - state.entryBorrowIndex;
        uint256 borrowCost = FixedPointMath.mulDivUp(borrowDelta, reducedSizeWad, WAD);
        int256 netPnl = directional - fundingCost - SafeCast.toInt256(borrowCost);
        uint256 fee = _feeUsdc(sizeReduced, feeConfig.closeFeeRateWad);
        Position storage stored = positions[positionId];
        PositionState storage storedState = positionStates[positionId];
        (uint256 expectedPayout, uint256 expectedBadDebt, uint256 expectedRemaining) =
            _partialSettlementOutcome(position.collateral, collateralReleased, netPnl, fee);
        stored.size -= sizeReduced;
        stored.collateral = expectedRemaining;
        storedState.sizeUsdWad -= reducedSizeWad;
        storedState.collateralUsdc = expectedRemaining;
        storedState.entryFundingIndex = accrual.fundingIndexWad;
        storedState.entryBorrowIndex = accrual.borrowIndexWad;
        totalOpenInterest[position.marketId] -= sizeReduced;
        if (position.isLong) longOpenInterest[position.marketId] -= sizeReduced;
        else shortOpenInterest[position.marketId] -= sizeReduced;
        if (stored.size == 0) {
            stored.open = false;
            activePosition[_accountMarket(position.trader, position.marketId)] = 0;
        }
        emit PositionReduced(positionId, collateralReleased, sizeReduced);
        // The vault emits the settlement event; this engine emits the canonical position mutation.
        // State is complete and the public entrypoint holds ReentrancyGuard.
        (uint256 payout, uint256 badDebt, uint256 remainingCollateral) = marginVault.settlePartialWad(
            position.trader, position.collateral, collateralReleased, netPnl, fee
        );
        if (
            payout != expectedPayout || badDebt != expectedBadDebt
                || remainingCollateral != expectedRemaining
        ) revert InvalidSettlementOutcome();
        emit PartialSettlementOutcome(positionId, payout, badDebt);
        if (badDebt > 0) _coverBadDebt(badDebt);
    }

    function _partialSettlementOutcome(
        uint256 positionCollateral,
        uint256 collateralReleased,
        int256 netPnlUsdWad,
        uint256 feeUsdc
    ) private pure returns (uint256 payoutUsdc, uint256 badDebt, uint256 remainingCollateral) {
        if (netPnlUsdWad >= 0) {
            uint256 gain = FixedPointMath.usdWadToUsdcDown(SafeCast.toUint256(netPnlUsdWad));
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
            return (payoutUsdc, badDebt, remainingCollateral);
        }

        uint256 loss = FixedPointMath.usdWadToUsdcUp(SafeCast.magnitude(netPnlUsdWad));
        uint256 debit = loss + feeUsdc;
        uint256 consumed = debit > positionCollateral ? positionCollateral : debit;
        uint256 requiredFromPosition = consumed > collateralReleased ? consumed : collateralReleased;
        remainingCollateral = positionCollateral - requiredFromPosition;
        payoutUsdc = collateralReleased > consumed ? collateralReleased - consumed : 0;
        if (debit > positionCollateral) badDebt = debit - positionCollateral;
    }

    function _closeFor(uint256 positionId, uint256 price, address account)
        private
        returns (uint256 badDebt)
    {
        Position memory position = positions[positionId];
        if (!position.open || position.trader != account) revert InvalidPosition();
        _updateMarketAccrual(position.marketId);
        PositionState memory state = positionStates[positionId];
        int256 netPnl = _netPnl(state, price);
        uint256 fee = _feeUsdc(position.size, feeConfig.closeFeeRateWad);
        _removePosition(positionId, position);
        // State and OI are already removed before settlement.
        badDebt = marginVault.settlePositionWad(account, position.collateral, netPnl, fee);
        if (badDebt > 0) _coverBadDebt(badDebt);
        emit PositionClosed(positionId, netPnl, badDebt);
    }

    function _removePosition(uint256 positionId, Position memory position) private {
        totalOpenInterest[position.marketId] -= position.size;
        if (position.isLong) longOpenInterest[position.marketId] -= position.size;
        else shortOpenInterest[position.marketId] -= position.size;
        activePosition[_accountMarket(position.trader, position.marketId)] = 0;
        positions[positionId].open = false;
        positions[positionId].size = 0;
        positions[positionId].collateral = 0;
        positionStates[positionId].sizeUsdWad = 0;
        positionStates[positionId].collateralUsdc = 0;
    }

    function _updateMarketAccrual(bytes32 marketId) private {
        MarketAccrual storage current = marketAccrual[marketId];
        uint64 now64 = SafeCast.toUint64(block.timestamp);
        if (current.lastUpdatedAt == 0) {
            current.lastUpdatedAt = now64;
            return;
        }
        // Arc permits equal timestamps across consecutive blocks; this is a valid zero-time update.
        if (now64 <= current.lastUpdatedAt) return;
        uint256 elapsed = uint256(now64 - current.lastUpdatedAt);
        EconomicModel.FundingUpdate memory funding = EconomicModel.fundingUpdate(
            FixedPointMath.usdcToUsdWad(longOpenInterest[marketId]),
            FixedPointMath.usdcToUsdWad(shortOpenInterest[marketId]),
            elapsed,
            fundingConfig
        );
        current.fundingIndexWad += funding.indexDeltaWad;
        uint256 available = marginVault.withdrawableLiquidity();
        if (available > 0) {
            (, uint256 indexDelta,) = EconomicModel.borrowFee(
                FixedPointMath.usdcToUsdWad(totalOpenInterest[marketId]),
                FixedPointMath.usdcToUsdWad(available),
                elapsed,
                WAD,
                borrowConfig
            );
            current.borrowIndexWad += indexDelta;
        }
        current.lastUpdatedAt = now64;
        emit MarketAccrualUpdated(
            marketId, current.fundingIndexWad, current.borrowIndexWad, current.lastUpdatedAt
        );
    }

    function _positionCost(PositionState memory state, MarketAccrual memory accrual)
        private
        pure
        returns (int256 cost)
    {
        int256 fundingDelta = accrual.fundingIndexWad - state.entryFundingIndex;
        if (!state.isLong) fundingDelta = -fundingDelta;
        int256 fundingCost = FixedPointMath.signedMulDiv(fundingDelta, state.sizeUsdWad, WAD);
        uint256 borrowCost = FixedPointMath.mulDivUp(
            accrual.borrowIndexWad - state.entryBorrowIndex, state.sizeUsdWad, WAD
        );
        cost = fundingCost + SafeCast.toInt256(borrowCost);
    }

    function _netPnl(PositionState memory state, uint256 price) private view returns (int256) {
        int256 pnl = FixedPointMath.directionalPnl(
            state.isLong, state.sizeUsdWad, state.entryPriceWad, price
        );
        return pnl - _positionCost(state, marketAccrual[state.marketId]);
    }

    function _equityUsdc(uint256 collateral, int256 netPnlUsdWad) private pure returns (uint256) {
        if (netPnlUsdWad >= 0) {
            return collateral + FixedPointMath.usdWadToUsdcDown(SafeCast.toUint256(netPnlUsdWad));
        }
        uint256 loss = FixedPointMath.usdWadToUsdcUp(SafeCast.magnitude(netPnlUsdWad));
        return loss >= collateral ? 0 : collateral - loss;
    }

    function _collateralAfterAccrual(uint256 collateral, int256 signedCostUsdWad)
        private
        pure
        returns (uint256 adjusted)
    {
        if (signedCostUsdWad >= 0) {
            uint256 cost = FixedPointMath.usdWadToUsdcUp(SafeCast.toUint256(signedCostUsdWad));
            if (cost >= collateral) revert AccruedCostExceedsCollateral();
            return collateral - cost;
        }
        return collateral + FixedPointMath.usdWadToUsdcDown(SafeCast.magnitude(signedCostUsdWad));
    }

    function _coverBadDebt(uint256 badDebt) private {
        // State is complete and this call is reached only under ReentrancyGuard.
        (uint256 covered, uint256 uncovered) =
            insuranceFund.coverBadDebt(address(marginVault), badDebt);
        if (covered > 0) {
            // The insurance transfer and this custody update are atomic in the guarded call path.
            marginVault.receiveInsuranceCoverage(covered);
        }
        emit BadDebtCoverageApplied(badDebt, covered, uncovered);
    }

    function _routeFee(uint256 fee) private {
        uint256 insuranceShare = (fee * feeConfig.insuranceShareBps) / 10_000;
        if (insuranceShare > 0) {
            marginVault.accrueInsuranceReserve(insuranceShare);
        }
    }

    function _feeUsdc(uint256 size, uint256 feeRateWad) private pure returns (uint256) {
        if (feeRateWad == 0) return 0;
        return FixedPointMath.usdWadToUsdcUp(
            FixedPointMath.mulDivUp(FixedPointMath.usdcToUsdWad(size), feeRateWad, WAD)
        );
    }

    function _executionPrice(bytes32 marketId, bool isLong, bool opening)
        private
        view
        returns (uint256 price)
    {
        price = oracleRouter.getExecutionPrice(marketId, isLong, opening);
        if (price == 0) revert InvalidOracleReport();
    }

    function _requireCanIncrease(bytes32 marketId) private view {
        if (
            !marketRegistry.canIncreaseExposure(marketId)
                || !riskConfig.canIncreaseExposure(marketId)
        ) revert MarketCannotIncreaseExposure();
    }

    function _enforceExposure(bytes32 marketId, bool isLong, uint256 size, uint256 maxOI)
        private
        view
    {
        if (totalOpenInterest[marketId] + size > maxOI) revert MaxOIExceeded();
        SideCaps memory caps = sideCaps[marketId];
        uint256 sideCap = isLong ? caps.maxLong : caps.maxShort;
        if (sideCap == 0) sideCap = maxOI;
        uint256 sideInterest = isLong ? longOpenInterest[marketId] : shortOpenInterest[marketId];
        if (sideInterest + size > sideCap) revert MaxOIExceeded();
        if (totalOpenInterest[marketId] != 0 && maxSkewRatioWad < WAD) {
            uint256 nextLong =
                isLong ? longOpenInterest[marketId] + size : longOpenInterest[marketId];
            uint256 nextShort =
                isLong ? shortOpenInterest[marketId] : shortOpenInterest[marketId] + size;
            uint256 nextSkew = nextLong >= nextShort ? nextLong - nextShort : nextShort - nextLong;
            if (FixedPointMath.mulDivUp(nextSkew, WAD, nextLong + nextShort) > maxSkewRatioWad) {
                revert SkewCapExceeded();
            }
        }
    }

    function _worseningSkewFee(bytes32 marketId, bool isLong, uint256 size)
        private
        view
        returns (uint256)
    {
        if (worseningSkewFeeRateWad == 0 || totalOpenInterest[marketId] == 0) return 0;
        uint256 beforeSkew = longOpenInterest[marketId] >= shortOpenInterest[marketId]
            ? longOpenInterest[marketId] - shortOpenInterest[marketId]
            : shortOpenInterest[marketId] - longOpenInterest[marketId];
        uint256 nextLong = isLong ? longOpenInterest[marketId] + size : longOpenInterest[marketId];
        uint256 nextShort =
            isLong ? shortOpenInterest[marketId] : shortOpenInterest[marketId] + size;
        uint256 afterSkew = nextLong >= nextShort ? nextLong - nextShort : nextShort - nextLong;
        if (afterSkew <= beforeSkew) return 0;
        return _feeUsdc(size, worseningSkewFeeRateWad);
    }

    function _requireVaultCapacity(bytes32 marketId, uint256 sizeAdded) private view {
        // The legacy no-token harness is retained for historical accounting tests. The
        // production ERC-20 path reserves market notional against actual free backing so a
        // configured OI cap cannot outlive the vault that settles it.
        if (marginVault.collateralToken() == address(0)) return;
        uint256 availableBacking = marginVault.withdrawableLiquidity();
        if (totalOpenInterest[marketId] + sizeAdded > availableBacking) {
            revert InsufficientVaultCapacity();
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
