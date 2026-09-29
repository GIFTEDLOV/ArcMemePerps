// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "./AccessControlled.sol";
import {IUSDCMarginVault} from "./interfaces/IUSDCMarginVault.sol";

contract USDCMarginVault is AccessControlled, IUSDCMarginVault {
    mapping(address trader => uint256 amount) public freeCollateral;
    mapping(address trader => uint256 amount) public lockedCollateral;
    uint256 public totalFreeCollateral;
    uint256 public totalLockedCollateral;
    uint256 public protocolBadDebt;
    address public engine;

    error UnauthorizedEngine();
    error InsufficientFreeCollateral();
    error InsufficientLockedCollateral();

    event EngineSet(address indexed engine);
    event AccountingCredit(address indexed trader, uint256 amount);
    event CollateralLocked(address indexed trader, uint256 amount);
    event CollateralUnlocked(address indexed trader, uint256 amount);
    event PositionSettled(address indexed trader, uint256 collateral, int256 pnl, uint256 badDebt);

    modifier onlyEngine() {
        if (msg.sender != engine) revert UnauthorizedEngine();
        _;
    }

    modifier onlyEngineOrOwner() {
        if (msg.sender != engine && msg.sender != owner) revert UnauthorizedEngine();
        _;
    }

    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    /**
     * Gate 1 accounting seed. A real USDC transfer/deposit adapter is intentionally deferred;
     * this method is not a claim that token custody is production-complete.
     */
    function creditCollateral(address trader, uint256 amount) external onlyOwner {
        freeCollateral[trader] += amount;
        totalFreeCollateral += amount;
        emit AccountingCredit(trader, amount);
    }

    function lockCollateral(address trader, uint256 amount) external onlyEngine {
        if (freeCollateral[trader] < amount) revert InsufficientFreeCollateral();
        freeCollateral[trader] -= amount;
        lockedCollateral[trader] += amount;
        totalFreeCollateral -= amount;
        totalLockedCollateral += amount;
        emit CollateralLocked(trader, amount);
    }

    function unlockCollateral(address trader, uint256 amount) external onlyEngineOrOwner {
        if (lockedCollateral[trader] < amount) revert InsufficientLockedCollateral();
        lockedCollateral[trader] -= amount;
        freeCollateral[trader] += amount;
        totalLockedCollateral -= amount;
        totalFreeCollateral += amount;
        emit CollateralUnlocked(trader, amount);
    }

    function settlePosition(address trader, uint256 collateral, int256 pnl)
        external
        onlyEngine
        returns (uint256 badDebt)
    {
        if (lockedCollateral[trader] < collateral) revert InsufficientLockedCollateral();
        lockedCollateral[trader] -= collateral;
        totalLockedCollateral -= collateral;
        if (pnl >= 0) {
            uint256 gain = uint256(pnl);
            freeCollateral[trader] += collateral + gain;
            totalFreeCollateral += collateral + gain;
        } else {
            uint256 loss = uint256(-pnl);
            if (loss <= collateral) {
                freeCollateral[trader] += collateral - loss;
                totalFreeCollateral += collateral - loss;
            } else {
                badDebt = loss - collateral;
                protocolBadDebt += badDebt;
                freeCollateral[trader] += 0;
            }
        }
        emit PositionSettled(trader, collateral, pnl, badDebt);
    }
}
