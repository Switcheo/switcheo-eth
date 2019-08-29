pragma solidity 0.5.10;

interface ERC20Token {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 tokens) external returns (bool);
}

contract UniswapExchange {
    mapping(address => address) public exchangeAddresses;

    address public token;

    constructor(address _token) public {
        token = _token;
    }

    function deposit() public payable {}

    function getExchange(address _token) public view returns (address) {
        return exchangeAddresses[_token];
    }

    // Trade ETH to ERC20
    function ethToTokenSwapInput(
        uint256 _minTokens,
        uint256 _deadline
    )
        external
        payable
        returns (uint256)
    {
        uint256 ethSold = msg.value;
        require(_deadline > now && ethSold > 0 && _minTokens > 0);

        uint256 tokenReserve = _tokenBalance(token);
        uint256 tokensBought = _getInputPrice(ethSold, address(this).balance - ethSold, tokenReserve);

        require(tokensBought >= _minTokens);
        ERC20Token(token).transfer(msg.sender, tokensBought);

        return tokensBought;
    }

    function _tokenBalance(address _assetId) private view returns (uint256) {
        return ERC20Token(_assetId).balanceOf(address(this));
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
