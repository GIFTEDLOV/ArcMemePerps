// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract AccessControlled {
    address public owner;

    bytes32 public constant GOVERNANCE_ADMIN_ROLE = keccak256("GOVERNANCE_ADMIN");
    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN");
    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN");
    bytes32 public constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN");
    bytes32 public constant QUALIFICATION_WRITER_ROLE = keccak256("QUALIFICATION_WRITER");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER");
    bytes32 public constant INSURANCE_MANAGER_ROLE = keccak256("INSURANCE_MANAGER");
    mapping(bytes32 role => mapping(address account => bool enabled)) private _roles;
    address public governanceExecutor;

    error NotOwner();
    error ZeroAddress();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoleUpdated(bytes32 indexed role, address indexed account, bool enabled);
    event GovernanceExecutorSet(address indexed executor);

    constructor() {
        owner = msg.sender;
        _roles[GOVERNANCE_ADMIN_ROLE][msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RoleUpdated(GOVERNANCE_ADMIN_ROLE, msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender] && msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyEmergencyAdmin() {
        if (!_roles[EMERGENCY_ADMIN_ROLE][msg.sender] && msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyGovernanceExecutor() {
        if (msg.sender != owner && msg.sender != governanceExecutor) revert NotOwner();
        _;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account] || (role == GOVERNANCE_ADMIN_ROLE && account == owner);
    }

    function setRole(bytes32 role, address account, bool enabled) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _roles[role][account] = enabled;
        emit RoleUpdated(role, account, enabled);
    }

    function setGovernanceExecutor(address executor) external onlyOwner {
        if (executor == address(0)) revert ZeroAddress();
        governanceExecutor = executor;
        emit GovernanceExecutorSet(executor);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
