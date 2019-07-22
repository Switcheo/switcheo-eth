pragma solidity 0.5.0;

import "./lib/math/SafeMath.sol";

contract Scratchpad {
    using SafeMath for uint256;

    function transferFromEncoded() public pure returns(bytes4) {
        return bytes4(keccak256('transferFrom(address,address,uint256)'));
    }
}
