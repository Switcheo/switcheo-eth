pragma solidity 0.5.10;

interface Broker {
    function owner() external returns (address);
    function isAdmin(address _user) external returns(bool);
    function markNonce(uint256 _nonce) external;
}

contract SpenderList {
    // The constants for EIP-712 are precompiled to reduce contract size,
    // the original values are left here for reference and verification.
    // NOTE: CHAIN_ID and VERIFYING_CONTRACT values must be updated before
    // mainnet deployment.
    //
    // bytes32 public constant CONTRACT_NAME = keccak256("Switcheo Exchange");
    // bytes32 public constant CONTRACT_VERSION = keccak256("2");
    // uint256 public constant CHAIN_ID = 3; // TODO: update this before deployment
    // address public constant VERIFYING_CONTRACT = address(1); // TODO: pre-calculate and update this before deployment
    // bytes32 public constant SALT = keccak256("switcheo-eth-eip712-salt");
    // bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(
    //     "EIP712Domain(",
    //         "string name,",
    //         "string version,",
    //         "uint256 chainId,",
    //         "address verifyingContract,",
    //         "bytes32 salt",
    //     ")"
    // ));
    // bytes32 public constant EIP712_DOMAIN_TYPEHASH = 0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472;

    // bytes32 public constant DOMAIN_SEPARATOR = keccak256(abi.encode(
    //     EIP712_DOMAIN_TYPEHASH,
    //     CONTRACT_NAME,
    //     CONTRACT_VERSION,
    //     CHAIN_ID,
    //     VERIFYING_CONTRACT,
    //     SALT
    // ));
    bytes32 public constant DOMAIN_SEPARATOR = 0x14f697e312cdba1c10a1eb5c87d96fa22b63aef9dc39592568387471319ea630;

    // bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = keccak256(abi.encodePacked(
    //     "AuthorizeSpender(",
    //         "address user,",
    //         "address spender,",
    //         "uint256 nonce",
    //     ")"
    // ));
    bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = 0xe26b1365004fe3cb06fb24dd69b50c8263f0a5a1df21e0a76f4d6184c3515d50;

    Broker broker;
    address brokerAddress;

    // A record of whitelisted spenders: spenderContract => isWhitelisted.
    // Spenders are intended to be extension contracts.
    // A user would first manually vet a spender contract then approve it to perform
     // balance transfers for their address, using the `authorizeSpender` method.
    mapping(address => bool) public spenderWhitelist;
    // A record of spender authorizations: userAddress => spenderAddress => isAuthorized
    mapping(address => mapping(address => bool)) public spenderAuthorizations;

    event AuthorizeSpender(
        address indexed user,
        address indexed spender,
        uint256 nonce
    );

    event UnauthorizeSpender(address indexed user, address indexed spender);

    constructor() public {
        spenderWhitelist[address(this)] = true;
    }

    function setBroker(address _brokerAddress) external {
        require(_brokerAddress != address(0));
        require(brokerAddress == address(0));
        brokerAddress = _brokerAddress;
        broker = Broker(_brokerAddress);
    }

    modifier onlyAdmin() {
        // Error code 1: onlyAdmin, address is not an admin address
        require(broker.isAdmin(msg.sender), "1");
        _;
    }

    modifier onlyOwner() {
        require(broker.owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    /// @notice Whitelists a spender contract
    /// @dev Spender contracts are intended to offer additional functionality
    /// to the Broker contract, allowing for new contract features to be added without
    /// having to migrate user funds to a new contract.
    /// After a spender contract is whitelisted, a user intending to use its
    /// features must separately authorize the spender contract before it can
    /// perform balance transfers for the user.
    /// See `authorizeSpender` and `spendFrom` methods for more details.
    /// @param _spender The address of the spender contract to whitelist
    function whitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        // Error code 10: whitelistSpender, spender is already whitelisted
        require(!spenderWhitelist[_spender], "10");
        spenderWhitelist[_spender] = true;
    }

    /// @notice Removes a spender contract from the spender whitelist
    /// @dev Note that removing a spender from the whitelist will not prevent
    /// a it from transferring balances for users who had previously
    /// authorized it.
    /// This is required because the contract owner would otherwise be able to
    /// cause a user's funds to be locked in the spender contract.
    /// @param _spender The address of the spender contract to remove from the whitelist
    function unwhitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
         // Error code 11: unwhitelistSpender, spender is not whitelisted
        require(spenderWhitelist[_spender], "11");
        delete spenderWhitelist[_spender];
    }

    /// @notice Allows users to authorize a spender contract to perform
    /// balance transfers for their address
    /// @dev After a spender contract is authorized, it can call the `spendFrom`
    /// method for the permitted user's address.
    /// @param _user The address of the user
    /// @param _spender The address of the whitelisted spender contract
    /// @param _nonce An unused nonce to prevent replay attacks
    /// @param _v The `v` component of the `_user`'s signature
    /// @param _r The `r` component of the `_user`'s signature
    /// @param _s The `s` component of the `_user`'s signature
    /// @param _prefixedSignature Indicates whether the Ethereum signed message
    /// prefix should be prepended during signature verification
    function authorizeSpender(
        address _user,
        address _spender,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bool _prefixedSignature
    )
        external
        onlyAdmin
    {
        // Error code 12: authorizeSpender, spender is not whitelisted
        require(spenderWhitelist[_spender], "12");
        broker.markNonce(_nonce);

        _validateSignature(
            keccak256(abi.encode(
                AUTHORIZE_SPENDER_TYPEHASH,
                _user,
                _spender,
                _nonce
            )),
            _user,
            _v,
            _r,
            _s,
            _prefixedSignature
        );
        spenderAuthorizations[_user][_spender] = true;
        emit AuthorizeSpender(_user, _spender, _nonce);
    }

    /// @notice Allows users to remove authorization for a spender contract to
    /// perform balance transfers for their address
    /// @dev This method can only be invoked for spender contracts already removed
    /// from the whitelist. This is to prevent users from unexpectedly removing
    /// authorization for a previously authorized spender, as doing so could prevent
    /// regular operation of the features offerred by the spender contract.
    /// This function does not require admin permission and is invokable directly by users.
    /// @param _spender The address of the spender contract
    function unauthorizeSpender(address _spender) external {
        // Error code 13: unauthorizeSpender, spender has not been removed from whitelist
        require(!spenderWhitelist[_spender], "13");

        address user = msg.sender;
        require(spenderAuthorizations[user][_spender]);

        delete spenderAuthorizations[user][_spender];
        emit UnauthorizeSpender(user, _spender);
    }

    function validateSpender(address _spender) external view {
        require(spenderWhitelist[_spender]);
    }

    function validateSpenderAuthorization(address _user, address _spender) external view {
        require(spenderAuthorizations[_user][_spender]);
    }

    /// @dev Validates that the specified `_hash` was signed by the specified `_user`.
    /// This method supports the EIP712 specification, the older Ethereum
    /// signed message specification is also supported for backwards compatibility.
    /// @param _hash The original hash that was signed by the user
    /// @param _user The user who signed the hash
    /// @param _v The `v` component of the `_user`'s signature
    /// @param _r The `r` component of the `_user`'s signature
    /// @param _s The `s` component of the `_user`'s signature
    /// @param _prefixed If true, the signature will be verified
    /// against the Ethereum signed message specification instead of the
    /// EIP712 specification
    function _validateSignature(
        bytes32 _hash,
        address _user,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bool _prefixed
    )
        private
        pure
    {
        bytes32 eip712Hash = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            _hash
        ));

        if (_prefixed) {
            bytes32 prefixedHash = keccak256(abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                eip712Hash
            ));
            // Error code 43: _validateSignature, invalid prefixed signature
            require(_user == ecrecover(prefixedHash, _v, _r, _s), "43");
        } else {
            // Error code 44: _validateSignature, invalid non-prefixed signature
            require(_user == ecrecover(eip712Hash, _v, _r, _s), "44");
        }
    }

    /// @dev Ensures that `_address` is not the zero address
    /// @param _address The address to check
    function _validateAddress(address _address) private pure {
        // Error code 45: _validateAddress, invalid address
        require(_address != address(0), "45");
    }
}
