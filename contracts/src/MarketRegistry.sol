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

    function computeEvmMarketId(uint256 chainId, address token) public pure returns (bytes32) {
        return keccak256(abi.encode(
            keccak256(bytes("ARCMEMEPERPS_MARKET_ID_V2")),
            keccak256(bytes("EVM")),
            chainId,
            token
        ));
    }

    function computeSolanaMarketId(bytes32 publicKey) public pure returns (bytes32) {
        return keccak256(abi.encode(
            keccak256(bytes("ARCMEMEPERPS_MARKET_ID_V2")),
            keccak256(bytes("SOLANA")),
            publicKey
        ));
    }

    function registerEvmMarket(uint256 chainId, address token, bytes32 lifecycle)
        external
        onlyOwner
        returns (bytes32 marketId)
    {
        marketId = computeEvmMarketId(chainId, token);
        if (_markets[marketId].exists) revert MarketAlreadyExists();
        _markets[marketId] = Market({
            marketId: marketId,
            originChain: bytes32(chainId),
            originToken: abi.encodePacked(token),
            lifecycle: lifecycle,
            state: MarketState.BLOCKED,
            exists: true
        });
        emit MarketRegistered(marketId, bytes32(chainId), abi.encodePacked(token));
    }

    function registerSolanaMarket(bytes32 publicKey, bytes32 lifecycle)
        external
        onlyOwner
        returns (bytes32 marketId)
    {
        marketId = computeSolanaMarketId(publicKey);
        if (_markets[marketId].exists) revert MarketAlreadyExists();
        _markets[marketId] = Market({
            marketId: marketId,
            originChain: keccak256(bytes("SOLANA")),
            originToken: abi.encodePacked(publicKey),
            lifecycle: lifecycle,
            state: MarketState.BLOCKED,
            exists: true
        });
        emit MarketRegistered(marketId, keccak256(bytes("SOLANA")), abi.encodePacked(publicKey));
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
