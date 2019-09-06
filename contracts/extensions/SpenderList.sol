pragma solidity 0.5.10;

import "./BrokerExtension.sol";
import "../Utils.sol";

/// @title The SpenderList extension for the BrokerV2 contract
/// @author Switcheo Network
/// @notice This contract allows new features to be added to the BrokerV2 contract
/// through spender contracts, these contracts are able to make fund transfers
/// on behalf of users.
/// @dev For security, the spender contract must first be whitelisted and separately
/// authorized by individual users, before it can transfer the funds of a user.
contract SpenderList is BrokerExtension {
    // The constants for EIP-712 are precompiled to reduce contract size,
    // the original values are left here for reference and verification.
    // bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = keccak256(abi.encodePacked(
    //     "AuthorizeSpender(",
    //         "address user,",
    //         "address spender,",
    //         "uint256 nonce",
    //     ")"
    // ));
    bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = 0xe26b1365004fe3cb06fb24dd69b50c8263f0a5a1df21e0a76f4d6184c3515d50;

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
        // whitelist this contract so that it can call BrokerV2.markNonce
        spenderWhitelist[address(this)] = true;
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
        Utils.validateAddress(_spender);
        require(!spenderWhitelist[_spender], "Spender already whitelisted");
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
        Utils.validateAddress(_spender);
        require(spenderWhitelist[_spender], "Spender not whitelisted");
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
        require(spenderWhitelist[_spender], "Spender not whitelisted");
        broker.markNonce(_nonce);

        Utils.validateSignature(
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
    /// This function does not require admin permission and is invocable directly by users.
    /// @param _spender The address of the spender contract
    function unauthorizeSpender(address _spender) external {
        require(!spenderWhitelist[_spender], "Spender not unlisted");

        address user = msg.sender;
        require(spenderAuthorizations[user][_spender], "Spender not authorized");

        delete spenderAuthorizations[user][_spender];
        emit UnauthorizeSpender(user, _spender);
    }

    /// @notice Validates if a spender contract has been whitelisted
    /// @param _spender The address of the spender contract
    function validateSpender(address _spender) external view {
        require(spenderWhitelist[_spender], "Invalid spender");
    }

    /// @notice Validates if a spender contract has been authorized by a user
    /// @param _user The user of the spender contract
    /// @param _spender The address of the spender contract
    function validateSpenderAuthorization(address _user, address _spender) external view {
        require(spenderAuthorizations[_user][_spender], "Unauthorized spender");
    }
}
