pragma solidity 0.5.12;

import "../lib/token/ERC777/ERC777.sol";

/**
* @title ZEUS Coin - Standard ERC777 token for testing
* https://eips.ethereum.org/EIPS/eip-777
*/
contract ZEUS is ERC777 {
    constructor() ERC777("Zeus Coin", "ZEUS", new address[](0)) public {}

    function mint(address account, uint256 amount) public returns (bool) {
        _mint(msg.sender, account, amount, "", "");
        return true;
    }
}
