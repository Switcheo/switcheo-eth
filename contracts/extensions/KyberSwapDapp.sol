pragma solidity 0.5.12;

import "../lib/math/SafeMath.sol";
import "./BrokerExtension.sol";
import "../Utils.sol";

interface KyberNetworkProxy {
    function trade(address src, uint256 srcAmount, address dest, address payable destAddress, uint256 maxDestAmount, uint256 minConversionRate, address walletId) external payable returns (uint256);
}

/// @title The DApp adapter contract for KyberSwap
/// @author Switcheo Network
/// @notice This contract allows BrokerV2 offers to be filled by KyberSwap
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

    /// @notice See Utils._performNetworkTrade for method details
    function tokenReceiver(
        address[] memory /* _assetIds */,
        uint256[] memory /* _dataValues */,
        address[] memory /* _addresses */
    )
        public
        view
        returns(address)
    {
        return address(this);
    }

    /// @notice See Utils._performNetworkTrade for method details
    function trade(
        address[] memory _assetIds,
        uint256[] memory _dataValues,
        address[] memory _addresses,
        address payable _recipient
    )
        public
        payable
    {
        uint256 ethValue = 0;

        if (_assetIds[0] != ETHER_ADDR) {
            Utils.transferTokensIn(msg.sender, _assetIds[0], _dataValues[0], _dataValues[0]);
            Utils.approveTokenTransfer(
                _assetIds[0],
                address(kyberNetworkProxy),
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
}
