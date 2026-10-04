// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "./IERC20.sol";

library SafeTransferLib {
    error TransferFailed();
    error TransferFromFailed();

    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool success, bytes memory returndata) =
            address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool)))) {
            revert TransferFailed();
        }
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory returndata) = address(token)
            .call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool)))) {
            revert TransferFromFailed();
        }
    }
}
