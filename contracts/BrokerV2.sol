pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";
import "./lib/ownership/Ownable.sol";
import "./lib/introspection/IERC1820Registry.sol";

contract ERC20Token {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract BrokerV2 is Ownable {
    using SafeMath for uint256;

    struct WithdrawalAnnouncement {
        uint256 amount;
        uint256 withdrawableAt;
    }

    bytes32 public constant CONTRACT_NAME = keccak256("Switcheo Exchange");
    bytes32 public constant CONTRACT_VERSION = keccak256("2");
    // TODO: update this before deployment
    uint256 public constant CHAIN_ID = 3;
    // TODO: pre-calculate and update this before deployment
    address public constant VERIFYING_CONTRACT = address(1);
    bytes32 public constant SALT = keccak256("switcheo-eth-eip712-salt");

    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(
        "EIP712Domain(",
            "string name,",
            "string version,",
            "uint256 chainId,",
            "address verifyingContract,",
            "bytes32 salt",
        ")"
    ));

    bytes32 public constant DOMAIN_SEPARATOR = keccak256(abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        CONTRACT_NAME,
        CONTRACT_VERSION,
        CHAIN_ID,
        VERIFYING_CONTRACT,
        SALT
    ));

    bytes32 public constant WITHDRAW_TYPEHASH = keccak256(abi.encodePacked(
        "Withdraw(",
            "address withdrawer,",
            "address assetId,",
            "uint256 amount,",
            "address feeAssetId,",
            "uint256 feeAmount,",
            "uint256 nonce",
        ")"
    ));

    bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = keccak256(abi.encodePacked(
        "AuthorizeSpender(",
            "address user,",
            "address spender,",
            "uint256 nonce",
        ")"
    ));

    // Ether token "address" is set as the constant 0x00
    address private constant ETHER_ADDR = address(0);

    // deposits
    uint256 private constant REASON_DEPOSIT = 0x01;
    uint256 private constant REASON_WITHDRAW = 0x09;
    uint8 private constant REASON_WITHDRAW_FEE_GIVE = 0x14;
    uint8 private constant REASON_WITHDRAW_FEE_RECEIVE = 0x15;

    uint32 private constant MAX_SLOW_WITHDRAW_DELAY = 604800;

    // The operator receives fees
    address public operator;

    uint32 public slowWithdrawDelay;

    mapping(address => bool) adminAddresses;

    // User balances by: userAddress => assetId => balance
    mapping(address => mapping(address => uint256)) public balances;

    mapping(uint256 => uint256) public usedNonces;

    mapping(address => bool) public approvedTokens;

    mapping(address => mapping(address => WithdrawalAnnouncement)) public withdrawlAnnouncements;

    mapping(address => bool) public approvedSpenders;

    mapping(address => mapping(address => bool)) public spenderAuthorizations;

    // Emitted on any balance state transition (+ve)
    event BalanceIncrease(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 indexed reason,
        uint256 nonceA,
        uint256 nonceB
    );

    // Emitted on any balance state transition (-ve)
    event BalanceDecrease(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 indexed reason,
        uint256 nonceA,
        uint256 nonceB
    );


    event AnnounceWithdraw(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 withdrawableAt
    );

    event AddAdmin(address indexed admin);
    event RemoveAdmin(address indexed admin);
    event WhitelistToken(address indexed assetId);
    event UnwhitelistToken(address indexed assetId);
    event AddSpender(address indexed spender);
    event RemoveSpender(address indexed spender);
    event AuthorizeSpender(
        address indexed user,
        address indexed spender,
        uint256 nonce
    );
    event UnauthorizeSpender(address indexed user, address indexed spender);

    constructor() public {
        adminAddresses[msg.sender] = true;
        operator = msg.sender;

        slowWithdrawDelay = MAX_SLOW_WITHDRAW_DELAY;

        IERC1820Registry erc1820 = IERC1820Registry(
            0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
        );

        erc1820.setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );
    }

    modifier onlyAdmin() {
        require(adminAddresses[msg.sender] == true, "Invalid sender");
        _;
    }

    function addAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        require(!adminAddresses[_admin], "Admin already added");
        adminAddresses[_admin] = true;
        emit AddAdmin(_admin);
    }

    function removeAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        require(adminAddresses[_admin], "Admin not yet added");
        delete adminAddresses[_admin];
        emit RemoveAdmin(_admin);
    }

    function whitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        require(!approvedTokens[_assetId], "Token already whitelisted");
        approvedTokens[_assetId] = true;
        emit WhitelistToken(_assetId);
    }

    function unwhitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        require(approvedTokens[_assetId], "Token not yet whitelisted");
        delete approvedTokens[_assetId];
        emit UnwhitelistToken(_assetId);
    }

    function whitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        require(!approvedSpenders[_spender], "Spender already added");
        approvedSpenders[_spender] = true;
        emit AddSpender(_spender);
    }

    function unwhitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        require(approvedSpenders[_spender], "Spender not yet added");
        delete approvedSpenders[_spender];
        emit RemoveSpender(_spender);
    }

    function authorizeSpender(
        address _user,
        address _spender,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
        onlyAdmin
    {
        require(approvedSpenders[_spender], "Invalid spender");
        _markNonce(_nonce);

        _validateSignature(_user, _v, _r, _s,
            keccak256(abi.encode(
                AUTHORIZE_SPENDER_TYPEHASH,
                _user,
                _spender,
                _nonce
            ))
        );
        spenderAuthorizations[_user][_spender] = true;
        emit AuthorizeSpender(_user, _spender, _nonce);
    }

    function unauthorizeSpender(address _spender) external {
        require(!approvedSpenders[_spender], "Spender still active");

        address user = msg.sender;
        require(
            spenderAuthorizations[user][_spender],
            "Spender not yet authorized"
        );

        delete spenderAuthorizations[user][_spender];
        emit UnauthorizeSpender(user, _spender);
    }

    function spendFrom(
        address _from,
        address _to,
        address _assetId,
        uint256 _amount
    )
        external
    {
        require(
            spenderAuthorizations[_from][msg.sender],
            "Spender not yet approved"
        );

        _validateAddress(_to);

        balances[_from][_assetId] = balances[_from][_assetId].sub(_amount);
        balances[_to][_assetId] = balances[_to][_assetId].add(_amount);
    }

    function deposit() external payable {
        require(msg.value > 0, "Invalid value");
        _increaseBalance(msg.sender, ETHER_ADDR, msg.value, REASON_DEPOSIT, 0, 0);
    }

    function depositToken(
        address _user,
        address _assetId,
        uint256 _nonce
    )
        external
        onlyAdmin
    {
        require(
            approvedTokens[_assetId] == false,
            "Whitelisted tokens cannot use this method of transfer"
        );
        _markNonce(_nonce);
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

        _increaseBalance(
            _user,
            _assetId,
            transferredAmount,
            REASON_DEPOSIT,
            _nonce,
            0
        );
    }

    // ERC223
    function tokenFallback(
        address _from,
        uint _value,
        bytes calldata /* _data */
    )
        external
    {
        address assetId = msg.sender;
        require(approvedTokens[assetId] == true, "Token not whitelisted");
        _increaseBalance(_from, assetId, _value, REASON_DEPOSIT, 0, 0);
    }

    // ERC777
    function tokensReceived(
        address /* _operator */,
        address _from,
        address _to,
        uint _amount,
        bytes calldata /* _userData */,
        bytes calldata /* _operatorData */
    )
        external
    {
        if (_to != address(this)) { return; }
        address assetId = msg.sender;
        require(approvedTokens[assetId] == true, "Token not whitelisted");
        _increaseBalance(_from, assetId, _amount, REASON_DEPOSIT, 0, 0);
    }
    function withdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
        onlyAdmin
    {
        _markNonce(_nonce);

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

        _withdraw(
            _withdrawer,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            _nonce
        );
    }

    function emergencyWithdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount
    )
        external
        onlyAdmin
    {
        _withdraw(_withdrawer, _assetId, _amount, address(0), 0, 0);
    }

    function announceWithdraw(
        address _assetId,
        uint256 _amount
    )
        external
    {
        require(
            _amount > 0 && _amount <= balances[msg.sender][_assetId],
            "Invalid amount"
        );

        WithdrawalAnnouncement storage announcement = withdrawlAnnouncements[msg.sender][_assetId];

        uint256 withdrawableAt = now + slowWithdrawDelay;
        announcement.withdrawableAt = withdrawableAt;
        announcement.amount = _amount;

        emit AnnounceWithdraw(msg.sender, _assetId, _amount, withdrawableAt);
    }

    function slowWithdraw(
        address payable _withdrawer,
        address _assetId
    )
        external
    {
        WithdrawalAnnouncement memory announcement = withdrawlAnnouncements[msg.sender][_assetId];

        require(announcement.amount > 0, "Invalid amount");
        require(
            announcement.withdrawableAt != 0 && announcement.withdrawableAt <= now,
            "Insufficient delay"
        );

        delete withdrawlAnnouncements[_withdrawer][_assetId];
        _withdraw(_withdrawer, _assetId, announcement.amount, address(0), 0, 0);
    }

    function _withdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _nonce
    )
        private
    {
        require(_amount > 0, 'Invalid amount');

        uint256 withdrawAmount = _decreaseBalanceWithFees(
            _withdrawer,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            REASON_WITHDRAW,
            REASON_WITHDRAW_FEE_GIVE,
            REASON_WITHDRAW_FEE_RECEIVE,
            _nonce,
            0
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

    function _markNonce(uint256 _nonce) private {
        require(_nonce != 0, "Invalid nonce");

        uint256 slot = _nonce.div(256);
        uint256 shiftedBit = 1 << _nonce.mod(256);
        uint256 bits = usedNonces[slot];

        require(bits & shiftedBit == 0, "Nonce already used");

        usedNonces[slot] = bits | shiftedBit;
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
            "\x19\x01",
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
        uint256 _feeReceiveReasonCode,
        uint256 _nonceA,
        uint256 _nonceB
    )
        private
        returns (uint256)
    {
        _decreaseBalance(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonceA,
            _nonceB
        );

        _increaseBalance(
            operator,
            _feeAssetId,
            _feeAmount,
            _feeReceiveReasonCode,
            _nonceA,
            _nonceB
        );

        if (_feeAssetId != _assetId) {
            _decreaseBalance(
                _user,
                _feeAssetId,
                _feeAmount,
                _feeGiveReasonCode,
                _nonceA,
                _nonceB
            );
            return _amount;
        }

        return _amount.sub(_feeAmount);
    }

    function _decreaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode,
        uint256 _nonceA,
        uint256 _nonceB
    )
        private
    {
        if (_amount == 0) { return; }
        balances[_user][_assetId] = balances[_user][_assetId].sub(_amount);
        emit BalanceDecrease(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonceA,
            _nonceB
        );
    }

    function _increaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode,
        uint256 _nonceA,
        uint256 _nonceB
    )
        private
    {
        if (_amount == 0) { return; }
        balances[_user][_assetId] = balances[_user][_assetId].add(_amount);
        emit BalanceIncrease(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonceA,
            _nonceB
        );
    }

    function _validateAddress(address _address) private pure {
        require(
            _address != address(0),
            'Invalid address'
        );
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

    function _getUint256FromBytes(
        bytes memory data
    )
        private
        pure
        returns (uint256)
    {
        uint256 parsed;
        assembly { parsed := mload(add(data, 32)) }
        return parsed;
    }
}
