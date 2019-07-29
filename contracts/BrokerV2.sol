pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";

contract ERC20Token {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract BrokerV2 {
    using SafeMath for uint256;

    bytes32 constant CONTRACT_NAME = keccak256("Switcheo Exchange");
    bytes32 constant CONTRACT_VERSION = keccak256("2");
    // TODO: update this before deployment
    uint256 constant CHAIN_ID = 3;
    // TODO: pre-calculate and update this before deployment
    address constant VERIFYING_CONTRACT = address(1);
    bytes32 constant SALT = keccak256("switcheo-eth-eip712-salt");

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)"
    ));
    bytes32 private constant DOMAIN_SEPARATOR = keccak256(abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        CONTRACT_NAME,
        CONTRACT_VERSION,
        CHAIN_ID,
        VERIFYING_CONTRACT,
        SALT
    ));

    bytes32 private constant WITHDRAW_TYPEHASH = keccak256(abi.encodePacked(
        "Withdraw(address withdrawer,address assetId,uint256 amount,address feeAssetId,uint256 feeAmount,uint64 nonce)"
    ));

    // Ether token "address" is set as the constant 0x00
    address constant ETHER_ADDR = address(0);

    // deposits
    uint256 constant REASON_DEPOSIT = 0x01;
    uint256 constant REASON_WITHDRAW = 0x09;
    uint8 constant REASON_WITHDRAW_FEE_GIVE = 0x14;
    uint8 constant REASON_WITHDRAW_FEE_RECEIVE = 0x15;

    // The admin sends trades (balance transitions) to the exchange
    address public admin;
    // The operator receives fees
    address public operator;

    // User balances by: userAddress => assetId => balance
    mapping(address => mapping(address => uint256)) public balances;

    // Emitted on any balance state transition (+ve)
    event BalanceIncrease(address indexed user, address indexed assetId, uint256 amount, uint256 indexed reason);

    constructor() public {
        admin = msg.sender;
        operator = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Invalid sender");
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
        onlyAdmin
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

    function withdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint64 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
        onlyAdmin
    {
        require(_amount > 0, 'Invalid amount');

        _validateSignature(_withdrawer, _v, _r, _s,
            keccak256(abi.encode(
                WITHDRAW_TYPEHASH,
                _withdrawer,
                _assetId,
                _amount,
                _feeAssetId,
                _feeAmount,
                _nonce
            ))
        );

        uint256 withdrawAmount = _decreaseBalanceWithFees(
            _withdrawer,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            REASON_WITHDRAW,
            REASON_WITHDRAW_FEE_GIVE,
            REASON_WITHDRAW_FEE_RECEIVE
        );

        if (_assetId == ETHER_ADDR) {
            _withdrawer.transfer(withdrawAmount);
            return;
        }

        _validateContractAddress(_assetId);

        bytes memory payload = abi.encodeWithSignature(
                                   "transfer(address,uint256)",
                                   _withdrawer,
                                   withdrawAmount
                               );
        bytes memory returnData = _callContract(_assetId, payload);

        // ensure that asset transfer succeeded
        _validateTransferResult(returnData);
    }

    function _validateSignature(
        address _user,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bytes32 _hash
    )
        private
        pure
    {
        bytes32 eip712Hash = keccak256(abi.encodePacked(
            "\\x19\\x01",
            DOMAIN_SEPARATOR,
            _hash
        ));
        require(_user == ecrecover(eip712Hash, _v, _r, _s), "Invalid signature");
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

    // returns remaining amount after fees
    function _decreaseBalanceWithFees(
        address _user,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _reasonCode,
        uint256 _feeGiveReasonCode,
        uint256 _feeReceiveReasonCode
    )
        private
        returns (uint256)
    {
        _decreaseBalance(_user, _assetId, _amount, _reasonCode);
        _increaseBalance(operator, _feeAssetId, _feeAmount, _feeReceiveReasonCode);

        if (_feeAssetId != _assetId) {
            _decreaseBalance(_user, _feeAssetId, _feeAmount, _feeGiveReasonCode);
            return _amount;
        }

        return _amount.sub(_feeAmount);
    }

    function _decreaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode
    )
        private
    {
        if (_amount == 0) { return; }
        balances[_user][_assetId] = balances[_user][_assetId].sub(_amount);
        emit BalanceIncrease(_user, _assetId, _amount, _reasonCode);
    }

    function _increaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode
    )
        private
    {
        if (_amount == 0) { return; }
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
