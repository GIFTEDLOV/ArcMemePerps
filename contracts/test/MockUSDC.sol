// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    bool public failTransfers;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
        totalSupply += amount;
        emit Transfer(address(0), account, amount);
    }

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (failTransfers || balanceOf[msg.sender] < amount) revert();
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool)
    {
        if (failTransfers || balanceOf[sender] < amount || allowance[sender][msg.sender] < amount) {
            revert();
        }
        allowance[sender][msg.sender] -= amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(sender, recipient, amount);
        return true;
    }
}
