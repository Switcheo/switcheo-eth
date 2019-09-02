pragma solidity 0.5.10;

interface Broker {
    function owner() external returns (address);
}

contract TokenList {
    Broker broker;
    address brokerAddress;

    // A record of whitelisted tokens: tokenAddress => isWhitelisted.
    // This controls token permission to invoke `tokenFallback` and `tokensReceived` callbacks
    // on this contract.
    mapping(address => bool) public tokenWhitelist;

    modifier onlyOwner() {
        require(broker.owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    function setBroker(address _brokerAddress) external {
        require(_brokerAddress != address(0));
        require(brokerAddress == address(0));
        brokerAddress = _brokerAddress;
        broker = Broker(_brokerAddress);
    }

    /// @notice Whitelists a token contract
    /// @dev This enables the token contract to call `tokensReceived` or `tokenFallback`
    /// on this contract.
    /// This layer of management is to prevent misuse of `tokensReceived` and `tokenFallback`
    /// methods by unvetted tokens.
    /// @param _assetId The token address to whitelist
    function whitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        // Error code 8: whitelistToken, token is already whitelisted
        require(!tokenWhitelist[_assetId], "8");
        tokenWhitelist[_assetId] = true;
    }

    /// @notice Removes a token contract from the token whitelist
    /// @param _assetId The token address to remove from the token whitelist
    function unwhitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
         // Error code 9: unwhitelistToken, token is not whitelisted
        require(tokenWhitelist[_assetId], "9");
        delete tokenWhitelist[_assetId];
    }

    function validateToken(address _assetId) external view {
        require(tokenWhitelist[_assetId]);
    }

    /// @dev Ensures that `_address` is not the zero address
    /// @param _address The address to check
    function _validateAddress(address _address) private pure {
        // Error code 45: _validateAddress, invalid address
        require(_address != address(0), "45");
    }
}
