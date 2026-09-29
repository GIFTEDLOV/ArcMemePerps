// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUSDCMarginVault {
    enum CustodyStatus {
        MATCH,
        SURPLUS,
        DEFICIT
    }

    function collateralToken() external view returns (address);

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function lockCollateral(address trader, uint256 amount) external;

    function unlockCollateral(address trader, uint256 amount) external;

    function settlePosition(address trader, uint256 collateral, int256 pnl)
        external
        returns (uint256 badDebt);

    function settlePositionWad(
        address trader,
        uint256 collateral,
        int256 netPnlUsdWad,
        uint256 feeUsdc
    ) external returns (uint256 badDebt);

    function settlePartialWad(
        address trader,
        uint256 positionCollateral,
        uint256 collateralReleased,
        int256 netPnlUsdWad,
        uint256 feeUsdc
    ) external returns (uint256 payoutUsdc, uint256 badDebt, uint256 remainingCollateral);

    function settleAccruedWad(address trader, uint256 positionCollateral, int256 signedCostUsdWad)
        external
        returns (uint256 newPositionCollateral, uint256 badDebt);

    function settleLiquidationWad(
        address trader,
        uint256 collateral,
        int256 netPnlUsdWad,
        uint256 liquidatorRewardUsdc,
        address liquidator
    ) external returns (uint256 badDebt, uint256 liquidatorRewardPaid, uint256 residualUsdc);

    function collectFee(address trader, uint256 amount) external;

    function accrueInsuranceReserve(uint256 amount) external;

    function receiveInsuranceCoverage(uint256 amount) external;

    function withdrawableLiquidity() external view returns (uint256);

    function actualCustodyUsdc() external view returns (uint256);

    function expectedCustodyUsdc() external view returns (uint256);

    function reconcileCustody()
        external
        view
        returns (CustodyStatus status, uint256 actual, uint256 expected, uint256 difference);

    function totalAccountedAssets() external view returns (uint256);
}
