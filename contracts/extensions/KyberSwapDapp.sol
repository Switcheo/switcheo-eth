pragma solidity 0.5.10;

import "../lib/math/SafeMath.sol";
import "./BrokerExtension.sol";

interface ERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

interface KyberNetworkProxy {
    function kyberNetworkContract() external view returns (address);
    function trade(address src, uint256 srcAmount, address dest, address payable destAddress, uint256 maxDestAmount, uint256 minConversionRate, address walletId) external payable returns (uint256);
}

contract KyberSwapDapp is BrokerExtension {
    using SafeMath for uint256;

    KyberNetworkProxy public kyberNetworkProxy;
    address private constant ETHER_ADDR = address(0);
    address private constant KYBER_ETHER_ADDR = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    constructor(address _kyberNetworkProxyAddress) public {
        kyberNetworkProxy = KyberNetworkProxy(_kyberNetworkProxyAddress);
    }

    function setKyberNetworkProxy(
        address _kyberNetworkProxyAddress
    )
        external
        onlyOwner
    {
        kyberNetworkProxy = KyberNetworkProxy(_kyberNetworkProxyAddress);
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
        address[] calldata _addresses,
        address payable _recipient
    )
        external
        payable
    {
        uint256 ethValue = 0;

        if (_assetIds[0] != ETHER_ADDR) {
            _transferTokensIn(msg.sender, _assetIds[0], _dataValues[0], _dataValues[0]);
            address kyberNetworkContract = kyberNetworkProxy.kyberNetworkContract();
            ERC20(_assetIds[0]).approve(
                kyberNetworkContract,
                _dataValues[0]
            );
        } else {
            ethValue = _dataValues[0];
        }

        address srcAssetId = _assetIds[0] == ETHER_ADDR ? KYBER_ETHER_ADDR : _assetIds[0];
        address dstAssetId = _assetIds[1] == ETHER_ADDR ? KYBER_ETHER_ADDR : _assetIds[1];

        // _dataValues[2] bits(24..32): fee sharing walletAddressIndex
        uint256 walletAddressIndex = (_dataValues[2] & ~(~uint256(0) << 32)) >> 24;

        kyberNetworkProxy.trade.value(ethValue)(
            srcAssetId,
            _dataValues[0], // srcAmount
            dstAssetId, // dest
            _recipient, // destAddress
            ~uint256(0), // maxDestAmount
            uint256(0), // minConversionRate
            _addresses[walletAddressIndex] // walletId
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
