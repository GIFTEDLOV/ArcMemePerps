// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";

contract ProtocolTimelock is AccessControlled, ReentrancyGuard {
    uint256 public immutable minDelay;
    mapping(bytes32 operationId => uint64 eta) public queuedAt;

    error OperationQueued();
    error OperationNotReady();
    error OperationMissing();
    error CallFailed();
    error InvalidDelay();

    event OperationQueuedEvent(bytes32 indexed operationId, address indexed target, uint64 eta);
    event OperationExecuted(bytes32 indexed operationId, address indexed target);
    event OperationCancelled(bytes32 indexed operationId);

    constructor(uint256 minDelay_) {
        if (minDelay_ == 0) revert InvalidDelay();
        minDelay = minDelay_;
    }

    function queue(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        onlyRole(GOVERNANCE_ADMIN_ROLE)
        returns (bytes32 operationId)
    {
        if (target == address(0)) revert ZeroAddress();
        operationId = keccak256(abi.encode(target, value, data, salt));
        if (queuedAt[operationId] != 0) revert OperationQueued();
        uint256 etaValue = block.timestamp + minDelay;
        // Timestamp is used only to bound a finite timelock delay; validator drift cannot bypass the delay.
        // forge-lint: disable-next-line(block-timestamp)
        if (etaValue > type(uint64).max) revert InvalidDelay();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 eta = uint64(etaValue);
        queuedAt[operationId] = eta;
        emit OperationQueuedEvent(operationId, target, eta);
    }

    function cancel(bytes32 operationId) external onlyRole(GOVERNANCE_ADMIN_ROLE) {
        if (queuedAt[operationId] == 0) revert OperationMissing();
        delete queuedAt[operationId];
        emit OperationCancelled(operationId);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        payable
        nonReentrant
        returns (bytes memory result)
    {
        if (target == address(0)) revert ZeroAddress();
        bytes32 operationId = keccak256(abi.encode(target, value, data, salt));
        uint64 eta = queuedAt[operationId];
        if (eta == 0) revert OperationMissing();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < eta) revert OperationNotReady();
        delete queuedAt[operationId];
        (bool success, bytes memory returned) = target.call{ value: value }(data);
        if (!success) revert CallFailed();
        // Queue state is finalized before the atomic external call.
        emit OperationExecuted(operationId, target);
        return returned;
    }
}
