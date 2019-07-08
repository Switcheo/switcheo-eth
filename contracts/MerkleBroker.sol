pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract MerkleBroker {
    using SafeMath for uint256;

    bytes32 public root;

    event TestHash();

    constructor() public {
        root = 0xf36f7832f885a8ec6a05b41cc48042ca29fa8e6b8ca37224864b5b6031ced4cd;
    }

    function testHash(bytes32 _value) external {
        root = keccak256(abi.encodePacked(_value));
        emit TestHash();
    }
}
