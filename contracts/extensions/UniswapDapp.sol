pragma solidity 0.5.10;

import "../lib/math/SafeMath.sol";
import "./BrokerExtension.sol";

interface ERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}

interface UniswapExchange {
    // Trade ETH to ERC20
    function ethToTokenTransferInput(uint256 minTokens, uint256 deadline, address recipient) external payable returns (uint256 tokensBought);
    // Trade ERC20 to ETH
    function tokenToEthTransferInput(uint256 tokensSold, uint256 minEth, uint256 deadline, address recipient) external returns (uint256 ethBought);
    // Trade ERC20 to ERC20
    function tokenToTokenTransferInput(uint256 tokensSold, uint256 minTokensBought, uint256 minEthBought, uint256 deadline, address recipient, address tokenAddr) external returns (uint256 tokensBought);
}

contract UniswapDapp is BrokerExtension {
    using SafeMath for uint256;

    UniswapFactory public factory;
    address private constant ETHER_ADDR = address(0);

    constructor(address _factoryAddress) public {
        factory = UniswapFactory(_factoryAddress);
    }

    function setFactory(address _factoryAddress) external onlyOwner {
        factory = UniswapFactory(_factoryAddress);
    }

    function tokenReceiver(
        address[] calldata /* _assetIds */,
        uint256[] calldata /* _dataValues */,
        address[] calldata /* _addresses */
    )
        external
        view
        returns(address)
    {
        return address(this);
    }

    function trade(
        address[] calldata _assetIds,
        uint256[] calldata _dataValues,
        address[] calldata /* _addresses */,
        address payable _recipient
    )
        external
        payable
    {
        // _dataValues[2] bits(24..56): delay
        uint256 deadline = now.add((_dataValues[2] & ~(~uint256(0) << 56)) >> 24);

        if (_assetIds[0] == ETHER_ADDR) {
            UniswapExchange exchange = UniswapExchange(factory.getExchange(_assetIds[1]));
            exchange.ethToTokenTransferInput.value(_dataValues[0])(
                _dataValues[1],
                deadline,
                _recipient
            );
            return;
        }

        UniswapExchange exchange = UniswapExchange(factory.getExchange(_assetIds[0]));

        _transferTokensIn(msg.sender, _assetIds[0], _dataValues[0], _dataValues[0]);
        ERC20(_assetIds[0]).approve(address(exchange), _dataValues[0]);

        if (_assetIds[1] == ETHER_ADDR) {
            exchange.tokenToEthTransferInput(
                _dataValues[0],
                _dataValues[1],
                deadline,
                _recipient
            );
            return;
        }

        // Use the minimum of 1 for minEth as the amount of intermediate eth
        // used for the trade is not important. It is only important that the
        // final received tokens is more than or equal to the wantAmount.
        exchange.tokenToTokenTransferInput(
            _dataValues[0],
            _dataValues[1],
            1,
            deadline,
            _recipient,
            _assetIds[1]
        );
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

        // Error code 46: transferTokensIn, transferredAmount does not match expectedAmount
        require(transferredAmount == _expectedAmount, "46");
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

    function _tokenBalance(address _assetId) private view returns (uint256) {
        return ERC20(_assetId).balanceOf(address(this));
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
        // Error code 63: _callContract, contract call failed
        require(success, "63");

        return returnData;
    }

    /// @dev Fix for ERC-20 tokens that do not have proper return type
    /// See: https://github.com/ethereum/solidity/issues/4116
    /// https://medium.com/loopring-protocol/an-incompatibility-in-smart-contract-threatening-dapp-ecosystem-72b8ca5db4da
    /// https://github.com/sec-bit/badERC20Fix/blob/master/badERC20Fix.sol
    /// @param _data The data returned from a transfer call
    function _validateTransferResult(bytes memory _data) private pure {
        // Error code 64: _validateTransferResult, invalid transfer result
        require(
            _data.length == 0 ||
            (_data.length == 32 && _getUint256FromBytes(_data) != 0),
            "64"
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
