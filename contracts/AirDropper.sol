pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Broker.sol";

/// @title The AirDropper contract to send ether to users
/// @author Switcheo Network
contract AirDropper {
    using SafeMath for uint256;

    // The Switcheo Broker contract
    Broker public broker;

    // A record of which hashes have been used before
    mapping(bytes32 => bool) public usedHashes;

    // Emitted when ether is sent
    event SendEther(bytes32 indexed id, address indexed receiver, uint256 amount);

    /// @notice Initializes the AirDropper contract
    /// @dev The broker is initialized to the Switcheo Broker
    constructor(address brokerAddress)
        public
    {
        broker = Broker(brokerAddress);
    }

    modifier onlyCoordinator() {
        require(
            msg.sender == address(broker.coordinator()),
            "Invalid sender"
        );
        _;
    }

    /// @notice The payable method to allow this contract to receive ether
    function depositEther() external payable {}

    /// @notice Sends ether to a receiving address.
    /// @param _id The unique identifier to prevent double spends
    /// @param _receiver The address of the receiver
    /// @param _amount The amount of ether to send
    function sendEther(
        bytes32 _id,
        address _receiver,
        uint256 _amount
    )
        external
        onlyCoordinator
    {
        _validateAndAddHash(_id);
        _receiver.transfer(_amount);
        emit SendEther(_id, _receiver, _amount);
    }

    /// @dev Ensures a hash hasn't been already used.
    /// This prevents replay attacks.
    function _validateAndAddHash(bytes32 _hash)
        private
    {
        require(
            usedHashes[_hash] != true,
            "hash already used"
        );

        usedHashes[_hash] = true;
    }
}
