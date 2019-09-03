pragma solidity 0.5.10;

import "../lib/math/SafeMath.sol";
import "./BrokerExtension.sol";
import "../BrokerUtils.sol";

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

    function trade(
        address[] memory _assetIds,
        uint256[] memory _dataValues,
        address[] memory /* _addresses */,
        address payable _recipient
    )
        public
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

        BrokerUtils.transferTokensIn(msg.sender, _assetIds[0], _dataValues[0], _dataValues[0]);
        BrokerUtils.approveTokenTransfer(
            _assetIds[0],
            address(exchange),
            _dataValues[0]
        );

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
}
