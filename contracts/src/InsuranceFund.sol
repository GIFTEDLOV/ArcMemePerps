// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IInsuranceFund} from "./interfaces/IInsuranceFund.sol";

contract InsuranceFund is AccessControlled, IInsuranceFund {
    uint256 public availableCapital;
    uint256 public badDebtCovered;
    uint256 public uncoveredBadDebt;
    address public engine;

    error UnauthorizedEngine();

    event EngineSet(address indexed engine);
    event CapitalFunded(uint256 amount);
    event BadDebtRecorded(uint256 amount, uint256 covered, uint256 uncovered);

    modifier onlyEngine() {
        if (msg.sender != engine) revert UnauthorizedEngine();
        _;
    }

    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    /** Gate 1 accounting hook; asset custody and funding flows are deferred. */
    function fund(uint256 amount) external onlyOwner {
        availableCapital += amount;
        emit CapitalFunded(amount);
    }

    function recordBadDebt(uint256 amount) external onlyEngine {
        uint256 covered = amount > availableCapital ? availableCapital : amount;
        uint256 uncovered = amount - covered;
        availableCapital -= covered;
        badDebtCovered += covered;
        uncoveredBadDebt += uncovered;
        emit BadDebtRecorded(amount, covered, uncovered);
    }
}
