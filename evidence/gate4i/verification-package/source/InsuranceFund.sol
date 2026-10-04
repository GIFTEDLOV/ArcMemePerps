// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { IERC20 } from "./IERC20.sol";
import { IInsuranceFund } from "./interfaces/IInsuranceFund.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";
import { SafeTransferLib } from "./SafeTransferLib.sol";

contract InsuranceFund is AccessControlled, IInsuranceFund, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    IERC20 public collateralToken;
    uint256 public availableCapital;
    uint256 public badDebtCovered;
    uint256 public uncoveredBadDebt;
    address public engine;

    error UnauthorizedEngine();
    error InvalidCollateralToken();
    error InsufficientCapital();
    error CustodyDeltaMismatch();

    event EngineSet(address indexed engine);
    event CollateralTokenSet(address indexed token);
    event CapitalFunded(uint256 amount);
    event BadDebtRecorded(uint256 amount, uint256 covered, uint256 uncovered);

    modifier onlyEngine() {
        if (msg.sender != engine) revert UnauthorizedEngine();
        _;
    }

    function setEngine(address engine_) external onlyGovernanceExecutor {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    function setCollateralToken(address token) external onlyGovernanceExecutor {
        if (token == address(0) || token.code.length == 0) revert InvalidCollateralToken();
        if (address(collateralToken) != address(0) && address(collateralToken) != token) {
            revert InvalidCollateralToken();
        }
        (bool success, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!success || data.length < 32 || abi.decode(data, (uint256)) != 6) {
            revert InvalidCollateralToken();
        }
        collateralToken = IERC20(token);
        emit CollateralTokenSet(token);
    }

    /**
     * Gate 1 accounting hook; asset custody and funding flows are deferred.
     */
    function fund(uint256 amount) external nonReentrant onlyRole(INSURANCE_MANAGER_ROLE) {
        if (amount == 0) revert InsufficientCapital();
        if (address(collateralToken) == address(0)) revert InvalidCollateralToken();
        uint256 beforeBalance = collateralToken.balanceOf(address(this));
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = collateralToken.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert CustodyDeltaMismatch();
        }
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

    function coverBadDebt(address vault, uint256 amount)
        external
        nonReentrant
        onlyEngine
        returns (uint256 covered, uint256 uncovered)
    {
        if (vault == address(0)) revert ZeroAddress();
        covered = amount > availableCapital ? availableCapital : amount;
        uncovered = amount - covered;
        availableCapital -= covered;
        badDebtCovered += covered;
        uncoveredBadDebt += uncovered;
        if (covered > 0) {
            if (address(collateralToken) == address(0)) revert InvalidCollateralToken();
            uint256 beforeBalance = collateralToken.balanceOf(address(this));
            collateralToken.safeTransfer(vault, covered);
            uint256 afterBalance = collateralToken.balanceOf(address(this));
            if (beforeBalance < afterBalance || beforeBalance - afterBalance != covered) {
                revert CustodyDeltaMismatch();
            }
        }
        // State is complete before the token transfer and vault callback above.
        emit BadDebtRecorded(amount, covered, uncovered);
    }

    function actualCustodyUsdc() external view returns (uint256) {
        if (address(collateralToken) == address(0)) return 0;
        return collateralToken.balanceOf(address(this));
    }
}
