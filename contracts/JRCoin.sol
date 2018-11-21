pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";

/**
* @title JR Coin - Standard ERC20 token for testing
*
* @dev Implementation of the basic standard token.
* https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md
* Based on OpenZepplin v1.12.0: https://github.com/OpenZeppelin/openzeppelin-solidity
*/
contract JRCoin is StandardToken, DetailedERC20 {
    event Mint(address indexed to, uint256 amount);

    constructor()
        DetailedERC20("JR Coin", "JRC", 18)
        StandardToken()
        public
    {}

   /**
   * @dev Function to mint tokens
   * @param _to The address that will receive the minted tokens.
   * @param _amount The amount of tokens to mint.
   * @return A boolean that indicates if the operation was successful.
   */
    function mint(
        address _to,
        uint256 _amount
    )
        public
        returns (bool)
    {
        totalSupply_ = totalSupply_.add(_amount);
        balances[_to] = balances[_to].add(_amount);
        emit Mint(_to, _amount);
        emit Transfer(address(0), _to, _amount);
        return true;
    }
}
