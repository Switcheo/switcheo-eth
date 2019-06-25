pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./BombCoin.sol";
import "./Broker.sol";

/// @title The BombBurner contract to burn 1% of tokens on approve+transfer
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

    event PrepareBurn(address indexed depositer, uint256 depositAmount, bytes32 indexed approvalTransactionHash, uint256 burnAmount);
    event ExecuteBurn(address indexed depositer, uint256 burnAmount, bytes32 indexed approvalTransactionHash);

    /// @notice Initializes the BombBurner contract
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
            _depositAmount > 0,
            "Invalid deposit amount"
        );

        require(
            bomb.allowance(_depositer, address(broker)) == _depositAmount,
            "Invalid approval amount"
        );

        preparedBurnAmounts[_depositer] = bomb.findOnePercent(_depositAmount);
        preparedBurnHashes[_depositer] = _approvalTransactionHash;

        emit PrepareBurn(_depositer, _depositAmount, _approvalTransactionHash, preparedBurnAmounts[_depositer]);
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
            _burnAmount == preparedBurnAmounts[_depositer],
            "Invalid burn amount"
        );

        require(
            _approvalTransactionHash == preparedBurnHashes[_depositer],
            "Invalid approval transaction hash"
        );

        require(
            bomb.allowance(_depositer, address(broker)) == 0,
            "Invalid approved amount"
        );

        delete preparedBurnAmounts[_depositer];
        delete preparedBurnHashes[_depositer];

        broker.spendFrom(
            _depositer,
            address(this),
            _burnAmount,
            address(bomb),
            ReasonDepositBurnGive,
            ReasonDepositBurnReceive
        );

        emit ExecuteBurn(_depositer, _burnAmount, _approvalTransactionHash);
    }
}
