pragma solidity 0.5.10;

import "./BrokerExtension.sol";
import "../Utils.sol";

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
        // Error code 8: whitelistToken, token is already whitelisted
        require(!tokenWhitelist[_assetId], "8");
        tokenWhitelist[_assetId] = true;
    }

    /// @notice Removes a token contract from the token whitelist
    /// @param _assetId The token address to remove from the token whitelist
    function unwhitelistToken(address _assetId) external onlyOwner {
        Utils.validateAddress(_assetId);
         // Error code 9: unwhitelistToken, token is not whitelisted
        require(tokenWhitelist[_assetId], "9");
        delete tokenWhitelist[_assetId];
    }

    function validateToken(address _assetId) external view {
        require(tokenWhitelist[_assetId]);
    }
}
