pragma solidity 0.5.10;

import "./BrokerExtension.sol";
import "../Utils.sol";

/// @title The TokenList extension for the BrokerV2 contract
/// @author Switcheo Network
/// @notice This contract maintains a list of whitelisted tokens.
/// @dev Whitelisted tokens are permitted to call the `tokenFallback` and
/// `tokensReceived` methods in the BrokerV2 contract.
contract TokenList is BrokerExtension {
    // A record of whitelisted tokens: tokenAddress => isWhitelisted.
    // This controls token permission to invoke `tokenFallback` and `tokensReceived` callbacks
    // on this contract.
    mapping(address => bool) public tokenWhitelist;

    /// @notice Whitelists a token contract
    /// @dev This enables the token contract to call `tokensReceived` or `tokenFallback`
    /// on this contract.
    /// This layer of management is to prevent misuse of `tokensReceived` and `tokenFallback`
    /// methods by unvetted tokens.
    /// @param _assetId The token address to whitelist
    function whitelistToken(address _assetId) external onlyOwner {
        Utils.validateAddress(_assetId);
        require(!tokenWhitelist[_assetId], "Token already whitelisted");
        tokenWhitelist[_assetId] = true;
    }

    /// @notice Removes a token contract from the token whitelist
    /// @param _assetId The token address to remove from the token whitelist
    function unwhitelistToken(address _assetId) external onlyOwner {
        Utils.validateAddress(_assetId);
        require(tokenWhitelist[_assetId], "Token not whitelisted");
        delete tokenWhitelist[_assetId];
    }

    /// @notice Validates if a token has been whitelisted
    /// @param _assetId The token address to validate
    function validateToken(address _assetId) external view {
        require(tokenWhitelist[_assetId], "Invalid token");
    }
}
