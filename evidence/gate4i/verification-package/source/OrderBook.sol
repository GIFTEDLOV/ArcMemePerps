// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IOracleRouter } from "./interfaces/IOracleRouter.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeCast } from "./SafeCast.sol";

/**
 * Two-phase order intent boundary. PerpEngine integration is deliberately explicit: this
 * contract proves intent freshness/idempotency and conservative execution price selection;
 * a later adapter can dispatch the validated intent to the engine without accepting a
 * user-supplied mark.
 */
contract OrderBook is AccessControlled, ReentrancyGuard {
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

    IOracleRouter public immutable oracleRouter;
    mapping(bytes32 orderId => OrderIntent intent) public orders;
    mapping(address account => uint256 nonce) public nextNonce;

    error InvalidOrder();
    error OrderNotFound();
    error OrderExpired();
    error OrderAlreadyFinalized();
    error UnauthorizedOrder();
    error PriceOutsideBound();

    event OrderSubmitted(
        bytes32 indexed orderId, address indexed account, bytes32 indexed marketId, uint256 nonce
    );
    event OrderCancelled(bytes32 indexed orderId, address indexed account);
    event OrderExecuted(bytes32 indexed orderId, uint256 executionPrice, uint64 oracleSequence);

    constructor(address oracleRouter_) {
        if (oracleRouter_ == address(0)) revert ZeroAddress();
        oracleRouter = IOracleRouter(oracleRouter_);
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
        uint256 currentTime = _clock();
        // forge-lint: disable-next-line(block-timestamp)
        if (
            marketId == bytes32(0) || sizeDelta == 0 || acceptablePrice == 0
                || !_isFuture(expiry, currentTime)
        ) {
            revert InvalidOrder();
        }
        uint256 nonce = nextNonce[msg.sender]++;
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
            SafeCast.toUint64(currentTime),
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
        returns (uint256 executionPrice)
    {
        OrderIntent storage order = orders[orderId];
        if (order.account == address(0)) revert OrderNotFound();
        if (order.executed || order.cancelled) revert OrderAlreadyFinalized();
        uint256 currentTime = _clock();
        // forge-lint: disable-next-line(block-timestamp)
        if (currentTime > order.expiry) revert OrderExpired();
        IOracleRouter.OracleReport memory report = oracleRouter.getReport(order.marketId);
        if (report.sequence != oracleSequence || report.sequence == 0) revert OrderExpired();
        // A keeper cannot execute an intent with an oracle observation older than the intent.
        // forge-lint: disable-next-line(block-timestamp)
        if (report.observedAt < order.createdAt) revert OrderExpired();
        executionPrice = oracleRouter.getExecutionPrice(
            order.marketId,
            order.isLong,
            order.action == Action.OPEN || order.action == Action.INCREASE
        );
        if (order.action == Action.OPEN || order.action == Action.INCREASE) {
            if (executionPrice > order.acceptablePrice) revert PriceOutsideBound();
        } else if (executionPrice < order.acceptablePrice) {
            revert PriceOutsideBound();
        }
        order.executed = true;
        emit OrderExecuted(orderId, executionPrice, report.sequence);
    }

    function _clock() private view returns (uint256) {
        return block.timestamp;
    }

    function _isFuture(uint64 expiry, uint256 currentTime) private pure returns (bool) {
        // The caller supplies the bounded block timestamp used for order expiry.
        // forge-lint: disable-next-line(block-timestamp)
        return expiry > currentTime;
    }
}
