pragma solidity 0.5.12;

import "../lib/math/SafeMath.sol";
import "./BrokerExtension.sol";
import "../Utils.sol";

interface UniswapRouterV2 {
    function WETH() external pure returns (address);
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts);
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        returns (uint[] memory amounts);
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}


/// @title The DApp adapter contract for Uniswap
/// @author Switcheo Network
/// @notice This contract allows BrokerV2 offers to be filled by Uniswap
contract UniswapDappV2 is BrokerExtension {
    using SafeMath for uint256;

    UniswapRouterV2 public router;
    address private constant ETHER_ADDR = address(0);

    constructor(address _routerAddress) public {
        router = UniswapRouterV2(_routerAddress);
    }

    function setRouter(address _routerAddress) external onlyOwner nonReentrant {
        router = UniswapRouterV2(_routerAddress);
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
        address[] memory /* _addresses */,
        address payable _recipient
    )
        public
        payable
        nonReentrant
    {
        // _dataValues[2] bits(24..56): delay
        uint256 deadline = now.add((_dataValues[2] & ~(~uint256(0) << 56)) >> 24);

        // give exact ETH and expect min tokens back
        if (_assetIds[0] == ETHER_ADDR) {
            address[] memory path = new address[](2);
            path[0] = router.WETH(); // token in
            path[1] = _assetIds[1]; // token out

            router.swapExactETHForTokens.value(_dataValues[0])(
                _dataValues[1],
                path,
                _recipient,
                deadline
            );
            return;
        }

        Utils.transferTokensIn(msg.sender, _assetIds[0], _dataValues[0], _dataValues[0]);
        Utils.approveTokenTransfer(
            _assetIds[0],
            address(router),
            _dataValues[0]
        );

        if (_assetIds[1] == ETHER_ADDR) {
            address[] memory path = new address[](2);
            path[0] = _assetIds[0]; // token in
            path[1] = router.WETH(); // token out

            router.swapExactTokensForETH(
                _dataValues[0],
                _dataValues[1],
                path,
                _recipient,
                deadline
            );
            return;
        }

        address[] memory path = new address[](2);
        path[0] = _assetIds[0]; // token in
        path[1] = _assetIds[1]; // token out

        router.swapExactTokensForTokens(
            _dataValues[0],
            _dataValues[1],
            path,
            _recipient,
            deadline
        );
    }
}
