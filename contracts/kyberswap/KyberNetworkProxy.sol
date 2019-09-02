pragma solidity 0.5.10;

import "../lib/math/SafeMath.sol";

interface ERC20 {
    function totalSupply() external view returns (uint supply);
    function balanceOf(address _owner) external view returns (uint balance);
    function transfer(address _to, uint _value) external returns (bool success);
    function transferFrom(address _from, address _to, uint _value) external returns (bool success);
    function approve(address _spender, uint _value) external returns (bool success);
    function allowance(address _owner, address _spender) external view returns (uint remaining);
    function decimals() external view returns(uint digits);
}

// https://github.com/KyberNetwork/smart-contracts/blob/master/contracts/KyberNetworkProxy.sol
contract KyberNetworkProxy {
    using SafeMath for uint256;

    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    address public kyberNetworkContract;
    uint256 public amountToGive;

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// params:
    /// _src Src token
    /// _srcAmount amount of _src tokens
    /// _dest Destination token
    /// _destAddress Address to send tokens to
    /// _maxDestAmount A limit on the amount of _dest tokens
    /// _minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// _walletId is the wallet ID to send part of the fees
    /// hint will give hints for the trade.
    /// @return amount of actual _dest tokens
    function trade(
        ERC20 _src,
        uint _srcAmount,
        ERC20 _dest,
        address payable _destAddress,
        uint /* _maxDestAmount */,
        uint /* _minConversionRate */,
        address /* _walletId */
    )
        public
        payable
        returns(uint)
    {
        require(_src == ETH_TOKEN_ADDRESS || msg.value == 0);
        if (_src == ETH_TOKEN_ADDRESS) {
            require(msg.value == _srcAmount);
        } else {
            _transferTokensIn(msg.sender, address(_src), _srcAmount, _srcAmount);
        }

        if (_dest == ETH_TOKEN_ADDRESS) {
            _destAddress.transfer(amountToGive);
        } else {
            _transferTokensOut(_destAddress, address(_dest), amountToGive);
        }

        return amountToGive;
    }

    function deposit() public payable {}
    function setAmountToGive(uint256 _amount) public { amountToGive = _amount; }
    function setKyberNetworkContract(address _address) public {
        kyberNetworkContract = _address;
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

    function _tokenBalance(address _assetId) private view returns (uint256) {
        return ERC20(_assetId).balanceOf(address(this));
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
