pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./BombCoin.sol";
import "./Broker.sol";

/// @title The AirDropper contract to send ether to users
/// @author Switcheo Network
contract BombBurner {
    using SafeMath for uint256;

    // The Switcheo Broker contract
    BOMBv3 public bomb;
    Broker public broker;

    uint8 constant ReasonDepositBurnGive = 0x40;
    uint8 constant ReasonDepositBurnReceive = 0x41;

    // A record of deposits that will have 1% burnt
    mapping(address => uint256) public preparedBurnAmounts;
    mapping(address => bytes32) public preparedBurnHashes;

    // Emitted when ether is sent
    event SendEther(bytes32 indexed id, address indexed receiver, uint256 amount);

    /// @notice Initializes the AirDropper contract
    /// @dev The broker is initialized to the Switcheo Broker
    constructor(address brokerAddress, address bombAddress)
        public
    {
        broker = Broker(brokerAddress);
        bomb = BOMBv3(bombAddress);
    }

    modifier onlyCoordinator() {
        require(
            msg.sender == address(broker.coordinator()),
            "Invalid sender"
        );
        _;
    }

    function prepareBurn(
        address _depositer,
        uint256 _depositAmount,
        bytes32 _approvalTransactionHash
    )
        external
        onlyCoordinator
    {
        require(
            bomb.allowance(_depositer, address(broker)) == _depositAmount,
            "Invalid deposit amount"
        );

        preparedBurnAmounts[_depositer] = bomb.findOnePercent(_depositAmount);
        preparedBurnHashes[_depositer] = _approvalTransactionHash;
    }

    function executeBurn(
        address _depositer,
        uint256 _burnAmount,
        bytes32 _approvalTransactionHash
    )
        external
        onlyCoordinator
    {
        require(
            preparedBurnAmounts[_depositer] == _burnAmount,
            "Invalid burn amount"
        );

        require(
            preparedBurnHashes[_depositer] == _approvalTransactionHash,
            "Invalid approval transaction hash"
        );

        broker.spendFrom(
            _depositer,
            address(this),
            _burnAmount,
            address(bomb),
            ReasonDepositBurnGive,
            ReasonDepositBurnReceive
        );
    }
}
