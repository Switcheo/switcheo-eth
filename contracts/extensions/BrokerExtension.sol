pragma solidity 0.5.10;

interface Broker {
    function owner() external returns (address);
    function isAdmin(address _user) external returns(bool);
    function markNonce(uint256 _nonce) external;
}

contract BrokerExtension {
    Broker public broker;

    modifier onlyAdmin() {
        require(broker.isAdmin(msg.sender));
        _;
    }

    modifier onlyOwner() {
        require(broker.owner() == msg.sender);
        _;
    }

    function setBroker(address _brokerAddress) external {
        require(_brokerAddress != address(0));
        require(address(broker) == address(0));
        broker = Broker(_brokerAddress);
    }
}
