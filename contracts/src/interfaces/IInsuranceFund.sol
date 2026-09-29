// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInsuranceFund {
    function recordBadDebt(uint256 amount) external;
}
