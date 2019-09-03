pragma solidity 0.5.10;

/// @title An adapted version of the UniswapFactory contract for testing
/// @notice https://github.com/Uniswap/contracts-vyper
contract UniswapFactory {
    mapping(address => address) public exchangeAddresses;

    function registerExchange(address exchangeAddress, address token) public {
        exchangeAddresses[token] = exchangeAddress;
    }

    function getExchange(address token) public view returns (address exchange) {
        return exchangeAddresses[token];
    }
}
