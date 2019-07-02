pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract MerkleBroker {
    using SafeMath for uint256;

    bytes32 public root;
    uint256 public leafCount;

    event TestHash();

    constructor()
        public
    {
        root = 0xf36f7832f885a8ec6a05b41cc48042ca29fa8e6b8ca37224864b5b6031ced4cd;
    }

    function testHash(bytes32[] _path) external {
        root = keccak256(abi.encodePacked(_path));

        emit TestHash();
    }

    function deposit(
        address _user,
        address _asset_id,
        uint256 _amount,
        uint256 _position
        /* bytes32[] _path */
    )
        external
    {
        // TODO: actually deposit assets

        // If root is empty, then initialize root
        if (leafCount == 0) {
            root = _hashBalance(_user, _asset_id, _amount);
            leafCount = 1;
            return;
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
        uint256 _amount
    )
        private
        view
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(
            address(this),
            "balance",
            _user,
            _asset_id,
            _amount
        ));
    }
}
