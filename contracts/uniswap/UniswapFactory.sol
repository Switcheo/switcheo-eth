pragma solidity 0.5.10;

contract UniswapFactory {
    mapping(address => address) public exchangeAddresses;

    function registerExchange(address exchangeAddress, address token) public {
        exchangeAddresses[token] = exchangeAddress;
    }

    function getExchange(address token) public view returns (address exchange) {
        return exchangeAddresses[token];
    }
}
