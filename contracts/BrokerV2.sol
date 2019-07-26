pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";

contract ERC20Token {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract BrokerV2 {
    using SafeMath for uint256;

    // Ether token "address" is set as the constant 0x00
    address constant ETHER_ADDR = address(0);

    // deposits
    uint256 constant REASON_DEPOSIT = 0x01;

    // The coordinator sends trades (balance transitions) to the exchange
    address public coordinator;
    // The operator receives fees
    address public operator;

    // User balances by: userAddress => assetId => balance
    mapping(address => mapping(address => uint256)) public balances;

    // Emitted on any balance state transition (+ve)
    event BalanceIncrease(address indexed user, address indexed assetId, uint256 amount, uint256 indexed reason);

    constructor() public {
        coordinator = msg.sender;
        operator = msg.sender;
    }

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "Invalid sender");
        _;
    }

    function deposit() external payable {
        require(msg.value > 0, "Invalid value");
        _increaseBalance(msg.sender, ETHER_ADDR, msg.value, REASON_DEPOSIT);
    }

    function depositToken(
        address _user,
        address _assetId
    )
        external
        onlyCoordinator
    {
        _validateContractAddress(_assetId);

        ERC20Token token = ERC20Token(_assetId);
        uint256 initialBalance = token.balanceOf(address(this));
        uint256 amount = token.allowance(_user, address(this));
        uint256 maxAmount = token.balanceOf(_user);

        // ensure that "amount" does not exceed what the user has
        if (amount > maxAmount) { amount = maxAmount; }
        if (amount == 0) { return; }

        // ERC20Token cannot be used for transferFrom calls because some
        // tokens have a transferFrom which returns a boolean and some do not
        // having two overloaded transferFrom methods does not work
        // as the signatures are the same but the return values are not
        bytes memory payload = abi.encodeWithSignature(
                                   "transferFrom(address,address,uint256)",
                                   _user,
                                   address(this),
                                   amount
                               );
        bytes memory returnData = _callContract(_assetId, payload);
        // ensure that asset transfer succeeded
        _validateTransferResult(returnData);

        uint256 finalBalance = token.balanceOf(address(this));
        uint256 transferredAmount = finalBalance - initialBalance;

        _increaseBalance(_user, _assetId, transferredAmount, REASON_DEPOSIT);
    }

    function _callContract(
        address _contract,
        bytes memory _payload
    )
        private
        returns(bytes memory)
    {
        bool success;
        bytes memory returnData;

        (success, returnData) = _contract.call(_payload);
        require(success, "contract call failed");

        return returnData;
    }

    function _increaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode
    )
        private
    {
        balances[_user][_assetId] = balances[_user][_assetId].add(_amount);
        emit BalanceIncrease(_user, _assetId, _amount, _reasonCode);
    }

    /// @dev Ensure that the address is a deployed contract
    function _validateContractAddress(address _contract) private view {
        assembly {
            if iszero(extcodesize(_contract)) { revert(0, 0) }
        }
    }

    /// @dev Fix for ERC-20 tokens that do not have proper return type
    /// See: https://github.com/ethereum/solidity/issues/4116
    /// https://medium.com/loopring-protocol/an-incompatibility-in-smart-contract-threatening-dapp-ecosystem-72b8ca5db4da
    /// https://github.com/sec-bit/badERC20Fix/blob/master/badERC20Fix.sol
    function _validateTransferResult(bytes memory data) private pure {
        require(
            data.length == 0 ||
            (data.length == 32 && _getUint256FromBytes(data) != 0),
            "Invalid transfer"
        );
    }

    function _getUint256FromBytes(bytes memory data) private pure returns (uint256) {
        uint256 parsed;
        assembly { parsed := mload(add(data, 32)) }
        return parsed;
    }
}
