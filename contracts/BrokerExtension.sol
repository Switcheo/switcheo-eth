pragma solidity 0.5.10;

interface Broker {
    function owner() external returns (address);
    function isAdmin(address _user) external returns(bool);
    function markNonce(uint256 _nonce) external;
}

contract BrokerExtension {
    address public brokerAddress;
    Broker public broker;

    modifier onlyAdmin() {
        // Error code 1: onlyAdmin, address is not an admin address
        require(broker.isAdmin(msg.sender), "1");
        _;
    }

    modifier onlyOwner() {
        require(broker.owner() == msg.sender);
        _;
    }

    function setBrokerAddress(address _brokerAddress) external {
        require(_brokerAddress != address(0));
        require(brokerAddress == address(0));
        brokerAddress = _brokerAddress;
        broker = Broker(brokerAddress);
    }
}
