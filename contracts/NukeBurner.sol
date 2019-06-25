pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "./Broker.sol";

/// @title The NukeBurner contract to burn 2% of tokens on approve+transfer
/// @author Switcheo Network
contract NukeBurner {
    using SafeMath for uint256;

    // The Switcheo Broker contract
    StandardToken public nuke;
    Broker public broker;

    uint8 constant ReasonDepositBurnGive = 0x40;
    uint8 constant ReasonDepositBurnReceive = 0x41;

    // A record of deposits that will have 1% burnt
    mapping(address => uint256) public preparedBurnAmounts;
    mapping(address => bytes32) public preparedBurnHashes;

    event PrepareBurn(address indexed depositer, uint256 depositAmount, bytes32 indexed approvalTransactionHash, uint256 burnAmount);
    event ExecuteBurn(address indexed depositer, uint256 burnAmount, bytes32 indexed approvalTransactionHash);

    /// @notice Initializes the NukeBurner contract
    constructor(address brokerAddress, address tokenAddress)
        public
    {
        broker = Broker(brokerAddress);
        nuke = StandardToken(tokenAddress);
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
            nuke.allowance(_depositer, address(broker)) == _depositAmount,
            "Invalid approval amount"
        );

        preparedBurnAmounts[_depositer] = _depositAmount.div(50);
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
            nuke.allowance(_depositer, address(broker)) == 0,
            "Invalid approved amount"
        );

        delete preparedBurnAmounts[_depositer];
        delete preparedBurnHashes[_depositer];

        broker.spendFrom(
            _depositer,
            address(this),
            _burnAmount,
            address(nuke),
            ReasonDepositBurnGive,
            ReasonDepositBurnReceive
        );

        emit ExecuteBurn(_depositer, _burnAmount, _approvalTransactionHash);
    }
}
