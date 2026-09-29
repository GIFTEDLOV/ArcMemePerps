// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IQualificationRegistry} from "./interfaces/IQualificationRegistry.sol";
import {IMarketRegistry} from "./interfaces/IMarketRegistry.sol";

contract MarketRegistry is AccessControlled, IMarketRegistry {
    enum MarketState {
        BLOCKED,
        PAUSED,
        CLOSE_ONLY,
        LIVE
    }

    struct Market {
        bytes32 marketId;
        bytes32 originChain;
        bytes originToken;
        bytes32 lifecycle;
        MarketState state;
        bool exists;
    }

    IQualificationRegistry public immutable qualificationRegistry;
    mapping(bytes32 marketId => Market market) private _markets;

    error MarketAlreadyExists();
    error MarketNotFound();
    error QualificationMissing();

    event MarketRegistered(bytes32 indexed marketId, bytes32 indexed originChain, bytes originToken);
    event LifecycleUpdated(bytes32 indexed marketId, bytes32 lifecycle);
    event MarketStateUpdated(bytes32 indexed marketId, MarketState state);

    constructor(address qualificationRegistry_) {
        if (qualificationRegistry_ == address(0)) revert ZeroAddress();
        qualificationRegistry = IQualificationRegistry(qualificationRegistry_);
    }

    function computeMarketId(bytes32 originChain, bytes memory originToken)
        public
        pure
        returns (bytes32)
    {
        // This is the packed preimage implemented by shared.marketIdForToken():
        // domain bytes + left-aligned bytes32 chain namespace + normalized token bytes.
        return keccak256(abi.encodePacked("ARCMEMEPERPS_MARKET_V1", originChain, originToken));
    }

    function registerMarket(bytes32 originChain, bytes calldata originToken, bytes32 lifecycle)
        external
        onlyOwner
        returns (bytes32 marketId)
    {
        marketId = computeMarketId(originChain, originToken);
        if (_markets[marketId].exists) revert MarketAlreadyExists();
        _markets[marketId] = Market({
            marketId: marketId,
            originChain: originChain,
            originToken: originToken,
            lifecycle: lifecycle,
            state: MarketState.BLOCKED,
            exists: true
        });
        emit MarketRegistered(marketId, originChain, originToken);
    }

    function setLifecycle(bytes32 marketId, bytes32 lifecycle) external onlyOwner {
        if (!_markets[marketId].exists) revert MarketNotFound();
        _markets[marketId].lifecycle = lifecycle;
        emit LifecycleUpdated(marketId, lifecycle);
    }

    function activateMarket(bytes32 marketId) external onlyOwner {
        if (!_markets[marketId].exists) revert MarketNotFound();
        if (!qualificationRegistry.isApproved(marketId)) revert QualificationMissing();
        _markets[marketId].state = MarketState.LIVE;
        emit MarketStateUpdated(marketId, MarketState.LIVE);
    }

    function setState(bytes32 marketId, MarketState state) external onlyOwner {
        if (!_markets[marketId].exists) revert MarketNotFound();
        _markets[marketId].state = state;
        emit MarketStateUpdated(marketId, state);
    }

    function marketExists(bytes32 marketId) external view returns (bool) {
        return _markets[marketId].exists;
    }

    function marketState(bytes32 marketId) external view returns (uint8) {
        if (!_markets[marketId].exists) revert MarketNotFound();
        return uint8(_markets[marketId].state);
    }

    function canIncreaseExposure(bytes32 marketId) external view returns (bool) {
        return _markets[marketId].exists && _markets[marketId].state == MarketState.LIVE;
    }

    function canReduceExposure(bytes32 marketId) external view returns (bool) {
        return _markets[marketId].exists;
    }

    function getMarket(bytes32 marketId) external view returns (Market memory) {
        if (!_markets[marketId].exists) revert MarketNotFound();
        return _markets[marketId];
    }
}
