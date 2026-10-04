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
    bool public bootstrapFinalized;

    error NotOwner();
    error ZeroAddress();
    error BootstrapNotReady();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoleUpdated(bytes32 indexed role, address indexed account, bool enabled);
    event GovernanceExecutorSet(address indexed executor);
    event BootstrapFinalized(address indexed formerOwner, address indexed governanceExecutor);

    constructor() {
        owner = msg.sender;
        _roles[GOVERNANCE_ADMIN_ROLE][msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RoleUpdated(GOVERNANCE_ADMIN_ROLE, msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner || bootstrapFinalized) revert NotOwner();
        _;
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender] && !(!bootstrapFinalized && msg.sender == owner)) {
            revert NotOwner();
        }
        _;
    }

    modifier onlyEmergencyAdmin() {
        if (
            !_roles[EMERGENCY_ADMIN_ROLE][msg.sender]
                && !(!bootstrapFinalized && msg.sender == owner)
        ) revert NotOwner();
        _;
    }

    modifier onlyGovernanceExecutor() {
        if (msg.sender != governanceExecutor && !(!bootstrapFinalized && msg.sender == owner)) {
            revert NotOwner();
        }
        _;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account]
            || (role == GOVERNANCE_ADMIN_ROLE && account == owner && !bootstrapFinalized);
    }

    function setRole(bytes32 role, address account, bool enabled) external onlyGovernanceExecutor {
        if (account == address(0)) revert ZeroAddress();
        _roles[role][account] = enabled;
        emit RoleUpdated(role, account, enabled);
    }

    function setGovernanceExecutor(address executor) external onlyGovernanceExecutor {
        if (executor == address(0) || executor == owner) revert ZeroAddress();
        governanceExecutor = executor;
        emit GovernanceExecutorSet(executor);
    }

    /**
     * Permanently ends deployer bootstrap authority for this contract.
     *
     * The deployment ceremony must assign the governance executor and all runtime
     * roles first. Once finalized, owner-only setup functions are disabled and the
     * deployer is removed from every built-in role, including governance admin.
     */
    function finalizeBootstrap() external onlyOwner {
        if (governanceExecutor == address(0) || governanceExecutor == owner) {
            revert BootstrapNotReady();
        }
        address formerOwner = owner;
        bootstrapFinalized = true;
        bytes32[7] memory roles = [
            GOVERNANCE_ADMIN_ROLE,
            RISK_ADMIN_ROLE,
            EMERGENCY_ADMIN_ROLE,
            ORACLE_ADMIN_ROLE,
            QUALIFICATION_WRITER_ROLE,
            KEEPER_ROLE,
            INSURANCE_MANAGER_ROLE
        ];
        for (uint256 index = 0; index < roles.length; index++) {
            if (_roles[roles[index]][formerOwner]) {
                _roles[roles[index]][formerOwner] = false;
                emit RoleUpdated(roles[index], formerOwner, false);
            }
        }
        emit BootstrapFinalized(formerOwner, governanceExecutor);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
