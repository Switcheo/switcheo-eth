pragma solidity 0.5.12;

interface Broker {
    function owner() external returns (address);
    function isAdmin(address _user) external returns(bool);
    function markNonce(uint256 _nonce) external;
}

contract BrokerExtension {
    Broker public broker;

    modifier onlyAdmin() {
        require(broker.isAdmin(msg.sender), "Invalid msg.sender");
        _;
    }

    modifier onlyOwner() {
        require(broker.owner() == msg.sender, "Invalid msg.sender");
        _;
    }

    function initializeBroker(address _brokerAddress) external {
        require(_brokerAddress != address(0), "Invalid _brokerAddress");
        require(address(broker) == address(0), "Broker already set");
        broker = Broker(_brokerAddress);
    }
}
