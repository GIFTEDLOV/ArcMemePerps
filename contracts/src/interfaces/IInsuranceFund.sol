// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInsuranceFund {
    function recordBadDebt(uint256 amount) external;

    function coverBadDebt(address vault, uint256 amount)
        external
        returns (uint256 covered, uint256 uncovered);
}
