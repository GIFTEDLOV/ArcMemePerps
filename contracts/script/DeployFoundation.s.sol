// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Deliberately contains no deployment implementation in Gate 1.
 * Network selection must be explicit via ARC_TESTNET / ARC_MAINNET environment configuration
 * and deployment authorization will be added only after economic review.
 */
contract DeployFoundation {
    // Gate 1 compatibility shell. Gate 4 uses DeployGate4.s.sol with explicit
    // network configuration; this contract intentionally performs no deployment.
}
