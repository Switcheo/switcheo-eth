pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract MerkleBroker {
    using SafeMath for uint256;

    bytes32 public root;
    uint256 public leafCount;
    address public prefix;

    constructor()
        public
    {
        prefix = address(this);
    }

    function deposit(
        address _user,
        address _asset_id,
        uint256 _amount,
        uint256 _position,
        bytes32[] _path
    )
        external
    {
        // TODO: actually deposit assets

        // If root is empty, then initialize root
        if (leafCount == 0) {
            root = _hashBalance(_user, _asset_id, _amount);
            leafCount = 1;
            return
        }

        require(
            _position <= leafCount,
            'Invalid position'
        );

        // Add a new leaf
        if (_position == leafCount) {

        }

    }


    function _hashBalance(
        address _user,
        address _asset_id,
        uint256 _amount,
    )
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(
            prefix,
            "balance",
            _user,
            _asset_id,
            _amount
        ));
    }
}
