pragma solidity 0.5.10;

interface ERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 tokens) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}

interface Exchange {
    // Trade ETH to ERC20
    function ethToTokenTransferInput(uint256 minTokens, uint256 deadline, address recipient) external payable returns (uint256);
}

contract UniswapExchange {
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

    function ethToTokenSwapInput(
        uint256 _minTokens,
        uint256 _deadline
    )
        external
        payable
        returns (uint256)
    {
        return _ethToTokenInput(msg.value, _minTokens, _deadline, msg.sender);
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

    function tokenToEthSwapInput(
        uint256 _tokensSold,
        uint256 _minEth,
        uint256 _deadline
    )
        external
        returns (uint256)
    {
        address payable buyer = msg.sender;
        require(_deadline > now && _tokensSold > 0 && _minEth > 0);

        uint256 tokenReserve = _getTokenReserve();
        uint256 ethBought = _getInputPrice(_tokensSold, tokenReserve, _getEthBalance());

        require(ethBought >= _minEth);

        buyer.transfer(ethBought);
        ERC20(token).transferFrom(buyer, address(this), _tokensSold);

        return ethBought;
    }

    function tokenToTokenSwapInput(
        uint256 _tokensSold,
        uint256 _minTokensBought,
        uint256 _minEthBought,
        uint256 _deadline,
        address _tokenAddr
    )
        external
        returns (uint256)
    {
        address exchangeAddr = UniswapFactory(factoryAddress).getExchange(_tokenAddr);
        address buyer = msg.sender;
        require(_deadline > now && _tokensSold > 0 && _minTokensBought > 0 && _minEthBought > 0);
        require(exchangeAddr != address(this) && exchangeAddr != address(0));

        uint256 tokenReserve = _getTokenReserve();
        uint256 ethBought = _getInputPrice(_tokensSold, tokenReserve, _getEthBalance());

        require(ethBought > _minEthBought);
        Exchange exchange = Exchange(exchangeAddr);

        uint256 tokensBought = exchange.ethToTokenTransferInput.value(ethBought)(
            _minTokensBought,
            _deadline,
            buyer
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
        require(_deadline > now && _ethSold > 0 && _minTokens > 0);

        uint256 tokenReserve = _getTokenReserve();
        uint256 tokensBought = _getInputPrice(_ethSold, _getEthBalance() - _ethSold, tokenReserve);

        require(tokensBought >= _minTokens);
        ERC20(token).transfer(_recipient, tokensBought);

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
        require(_inputReserve > 0 && _outputReserve > 0);
        uint256 inputAmountWithFee = _inputAmount * 997;
        uint256 numerator = inputAmountWithFee * _outputReserve;
        uint256 denominator = _inputReserve * 1000 + inputAmountWithFee;

        return numerator / denominator;
    }
}
