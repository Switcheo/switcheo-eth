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

    uint256 public amountToGive;

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// params:
    /// src Src token
    /// srcAmount amount of src tokens
    /// dest Destination token
    /// destAddress Address to send tokens to
    /// maxDestAmount A limit on the amount of dest tokens
    /// minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// walletId is the wallet ID to send part of the fees
    /// hint will give hints for the trade.
    /// @return amount of actual dest tokens
    function tradeWithHint(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address payable destAddress,
        uint /* maxDestAmount */,
        uint /* minConversionRate */,
        address /* walletId */
    )
        public
        payable
        returns(uint)
    {
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0);
        if (src == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            src.transferFrom(msg.sender, address(this), srcAmount);
        }

        if (dest == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(amountToGive);
        } else {
            dest.transfer(destAddress, amountToGive);
        }

        return amountToGive;
    }

    function setAmountToGive(uint256 _amount) public {
        amountToGive = _amount;
    }
}
