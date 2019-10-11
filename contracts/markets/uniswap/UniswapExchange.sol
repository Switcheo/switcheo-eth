pragma solidity 0.5.12;

import "../../lib/math/SafeMath.sol";

interface ERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}

interface Exchange {
    // Trade ETH to ERC20
    function ethToTokenTransferInput(uint256 minTokens, uint256 deadline, address recipient) external payable returns (uint256);
}

/// @title An adapted version of the UniswapExchange contract for testing
/// @notice https://github.com/Uniswap/contracts-vyper
contract UniswapExchange {
    using SafeMath for uint256;

    mapping(address => address) public exchangeAddresses;

    address public token;
    address public factoryAddress;

    constructor(address _token, address _factoryAddress) public {
        token = _token;
        factoryAddress = _factoryAddress;
    }

    function deposit() public payable {}

    function getExchange(address _token) public view returns (address) {
        return exchangeAddresses[_token];
    }

    function ethToTokenTransferInput(
        uint256 _minTokens,
        uint256 _deadline,
        address _recipient
    )
        external
        payable
        returns (uint256)
    {
        return _ethToTokenInput(msg.value, _minTokens, _deadline, _recipient);
    }

    function tokenToEthTransferInput(
        uint256 _tokensSold,
        uint256 _minEth,
        uint256 _deadline,
        address payable _recipient
    )
        external
        returns (uint256)
    {
        address payable buyer = msg.sender;
        require(_deadline > now && _tokensSold > 0 && _minEth > 0, "Invalid input");

        uint256 tokenReserve = _getTokenReserve();
        uint256 ethBought = _getInputPrice(_tokensSold, tokenReserve, _getEthBalance());

        require(ethBought >= _minEth, "Invalid eth amount received");

        _recipient.transfer(ethBought);
        _transferTokensIn(buyer, token, _tokensSold, _tokensSold);

        return ethBought;
    }

    function tokenToTokenTransferInput(
        uint256 _tokensSold,
        uint256 _minTokensBought,
        uint256 _minEthBought,
        uint256 _deadline,
        address _recipient,
        address _tokenAddr
    )
        external
        returns (uint256)
    {
        address exchangeAddr = UniswapFactory(factoryAddress).getExchange(_tokenAddr);
        address buyer = msg.sender;
        require(
            _deadline > now && _tokensSold > 0 && _minTokensBought > 0 && _minEthBought > 0,
            "Invalid input"
        );
        require(exchangeAddr != address(this) && exchangeAddr != address(0), "Invalid market");

        uint256 tokenReserve = _getTokenReserve();
        uint256 ethBought = _getInputPrice(_tokensSold, tokenReserve, _getEthBalance());

        _transferTokensIn(buyer, token, _tokensSold, _tokensSold);

        require(ethBought > _minEthBought, "Invalid eth amount received");
        Exchange exchange = Exchange(exchangeAddr);

        uint256 tokensBought = exchange.ethToTokenTransferInput.value(ethBought)(
            _minTokensBought,
            _deadline,
            _recipient
        );

        return tokensBought;
    }

    function _ethToTokenInput(
        uint256 _ethSold,
        uint256 _minTokens,
        uint256 _deadline,
        address _recipient
    )
        private
        returns (uint256)
    {
        require(_deadline > now && _ethSold > 0 && _minTokens > 0, "Invalid input");

        uint256 tokenReserve = _getTokenReserve();
        uint256 tokensBought = _getInputPrice(_ethSold, _getEthBalance() - _ethSold, tokenReserve);

        require(tokensBought >= _minTokens, "Invalid token amount received");
        _transferTokensOut(_recipient, token, tokensBought);

        return tokensBought;
    }

    function _getTokenReserve() private view returns (uint256) {
        return _tokenBalance(token);
    }

    function _getEthBalance() private view returns (uint256) {
        return address(this).balance;
    }

    function _tokenBalance(address _assetId) private view returns (uint256) {
        return ERC20(_assetId).balanceOf(address(this));
    }

    function _getInputPrice(
        uint256 _inputAmount,
        uint256 _inputReserve,
        uint256 _outputReserve
    )
        private
        pure
        returns (uint256)
    {
        require(_inputReserve > 0 && _outputReserve > 0, "Invalid reserves");
        uint256 inputAmountWithFee = _inputAmount * 997;
        uint256 numerator = inputAmountWithFee * _outputReserve;
        uint256 denominator = _inputReserve * 1000 + inputAmountWithFee;

        return numerator / denominator;
    }

    function _transferTokensIn(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _expectedAmount
    )
        private
    {
        _validateContractAddress(_assetId);

        uint256 initialBalance = _tokenBalance(_assetId);

        // Some tokens have a `transferFrom` which returns a boolean and some do not.
        // The ERC20 interface cannot be used here because it requires specifying
        // an explicit return value, and an EVM exception would be raised when calling
        // a token with the mismatched return value.
        bytes memory payload = abi.encodeWithSignature(
            "transferFrom(address,address,uint256)",
            _user,
            address(this),
            _amount
        );
        bytes memory returnData = _callContract(_assetId, payload);
        // Ensure that the asset transfer succeeded
        _validateTransferResult(returnData);

        uint256 finalBalance = _tokenBalance(_assetId);
        uint256 transferredAmount = finalBalance.sub(initialBalance);

        require(transferredAmount == _expectedAmount, "Invalid transfer");
    }

    function _transferTokensOut(
        address _receivingAddress,
        address _assetId,
        uint256 _amount
    )
        private
    {
        _validateContractAddress(_assetId);

        // Some tokens have a `transfer` which returns a boolean and some do not.
        // The ERC20 interface cannot be used here because it requires specifying
        // an explicit return value, and an EVM exception would be raised when calling
        // a token with the mismatched return value.
        bytes memory payload = abi.encodeWithSignature(
                                   "transfer(address,uint256)",
                                   _receivingAddress,
                                   _amount
                               );
        bytes memory returnData = _callContract(_assetId, payload);

        // Ensure that the asset transfer succeeded
        _validateTransferResult(returnData);
    }

    /// @dev Ensure that the address is a deployed contract
    /// @param _contract The address to check
    function _validateContractAddress(address _contract) private view {
        assembly {
            if iszero(extcodesize(_contract)) { revert(0, 0) }
        }
    }

    /// @dev A thin wrapper around the native `call` function, to
    /// validate that the contract `call` must be successful.
    /// See https://solidity.readthedocs.io/en/v0.5.1/050-breaking-changes.html
    /// for details on constructing the `_payload`
    /// @param _contract Address of the contract to call
    /// @param _payload The data to call the contract with
    /// @return The data returned from the contract call
    function _callContract(
        address _contract,
        bytes memory _payload
    )
        private
        returns (bytes memory)
    {
        bool success;
        bytes memory returnData;

        (success, returnData) = _contract.call(_payload);
        require(success, "Contract call failed");

        return returnData;
    }

    /// @dev Fix for ERC-20 tokens that do not have proper return type
    /// See: https://github.com/ethereum/solidity/issues/4116
    /// https://medium.com/loopring-protocol/an-incompatibility-in-smart-contract-threatening-dapp-ecosystem-72b8ca5db4da
    /// https://github.com/sec-bit/badERC20Fix/blob/master/badERC20Fix.sol
    /// @param _data The data returned from a transfer call
    function _validateTransferResult(bytes memory _data) private pure {
        require(
            _data.length == 0 ||
            (_data.length == 32 && _getUint256FromBytes(_data) != 0),
            "Invalid transfer result"
        );
    }

    /// @dev Converts data of type `bytes` into its corresponding `uint256` value
    /// @param _data The data in bytes
    /// @return The corresponding `uint256` value
    function _getUint256FromBytes(
        bytes memory _data
    )
        private
        pure
        returns (uint256)
    {
        uint256 parsed;
        assembly { parsed := mload(add(_data, 32)) }
        return parsed;
    }
}
