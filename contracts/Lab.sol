pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";

contract Lab {
    using SafeMath for uint256;

    mapping(address => mapping(address => uint256)) public balances;

    function getBalance() public view returns (uint256) {
        address user = address(this);
        address assetId = address(this);
        return balances[user][assetId];
    }

    function incrementBalance(uint256 amount) public {
        address user = address(this);
        address assetId = address(this);
        balances[user][assetId] += amount;
    }

    function batchIncrementBalance(uint256 amount) public {
        address user = address(this);
        address assetId = address(this);
        balances[user][assetId] += amount;
        balances[user][assetId] += amount * 2;
        balances[user][assetId] += amount * 3;
        balances[user][assetId] += amount * 4;
        balances[user][assetId] += amount * 5;
    }

    function clearBalance() public {
        address user = address(this);
        address assetId = address(this);
        delete balances[user][assetId];
    }

    function noop() public {}
}
