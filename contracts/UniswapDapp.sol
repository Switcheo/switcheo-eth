pragma solidity 0.5.10;

interface Broker {
    function owner() external returns (address);
}

interface ERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}

interface UniswapExchange {
    // Trade ETH to ERC20
    function ethToTokenSwapInput(uint256 minTokens, uint256 deadline) external payable returns (uint256 tokensBought);
    // Trade ERC20 to ETH
    function tokenToEthSwapInput(uint256 tokensSold, uint256 minEth, uint256 deadline) external returns (uint256 ethBought);
    // Trade ERC20 to ERC20
    function tokenToTokenSwapInput(uint256 tokensSold, uint256 minTokensBought, uint256 minEthBought, uint256 deadline, address tokenAddr) external returns (uint256 tokensBought);
}

contract UniswapDapp {
    address public factoryAddress;
    address private constant ETHER_ADDR = address(0);

    constructor(address _factoryAddress) public {
        factoryAddress = _factoryAddress;
    }

    function trade(
        address[] memory _assetIds,
        uint256[] memory _dataValues,
        address[] memory /* _addresses */
    )
        private
    {
        /* UniswapFactory factory = UniswapFactory(_marketDapps[1]);
        // _dataValues[2] bits(24..56): delay
        uint256 deadline = now.add((_dataValues[2] & ~(~uint256(0) << 56)) >> 24);

        if (_assetIds[0] == ETHER_ADDR) {
            UniswapExchange exchange = UniswapExchange(factory.getExchange(_assetIds[1]));
            exchange.ethToTokenSwapInput.value(_dataValues[0])(
                _dataValues[1],
                deadline
            );
            return;
        }

        address exchangeAddress = factory.getExchange(_assetIds[0]);
        UniswapExchange exchange = UniswapExchange(exchangeAddress);

        ERC20(_assetIds[0]).approve(exchangeAddress, _dataValues[0]);

        if (_assetIds[1] == ETHER_ADDR) {
            exchange.tokenToEthSwapInput(
                _dataValues[0],
                _dataValues[1],
                deadline
            );
            return;
        }

        // Use the minimum of 1 for minEth as the amount of intermediate eth
        // used for the trade is not important. It is only important that the
        // final received tokens is more than or equal to the wantAmount.
        exchange.tokenToTokenSwapInput(
            _dataValues[0],
            _dataValues[1],
            1,
            deadline,
            _assetIds[1]
        ); */
    }
}
