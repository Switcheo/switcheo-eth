pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract MerkleBroker {
    using SafeMath for uint256;

    bytes32 public root;

    mapping(address => mapping(address => uint256)) public balances;
    mapping(bytes32 => uint256) public offers;
    mapping(bytes32 => bool) public usedHashes;

    event BalanceIncrease(address indexed user, address indexed asset, uint256 amount);
    event BalanceDecrease(address indexed user, address indexed asset, uint256 amount);

    constructor() public {
        root = 0xf36f7832f885a8ec6a05b41cc48042ca29fa8e6b8ca37224864b5b6031ced4cd;
    }

    function deposit(address _user, address _asset, uint256 _amount) external {
        balances[_user][_asset] = balances[_user][_asset].add(_amount);
        emit BalanceIncrease(_user, _asset, _amount);
    }

    function withdraw(address _user, address _asset, uint256 _amount) external {
        balances[_user][_asset] = balances[_user][_asset].sub(_amount);
        emit BalanceDecrease(_user, _asset, _amount);
    }

    function trade(
        address[] calldata _users, // _users[0]: maker, _users[1]: taker
        address[] calldata _assets, // _assets[0]: offerAsset, _assets[1]: wantAsset
        uint256[] calldata _amounts, // _amounts[0]: offerAmount, _amounts[1]: wantAmount, _amounts[2]: takeAmount
        uint64[] calldata _nonces, // _nonces[0]: offerNonce, _nonces[1]: fillNonce
        uint8[] calldata _v,
        bytes32[] calldata _r,
        bytes32[] calldata _s
    )
        external
    {
        bytes32 offerHash = _makeOffer(_users, _assets, _amounts, _nonces[0], _v[0], _r[0], _s[0]);

        // taker, offerHash, takeAmount, fillNonce
        _validateFill(_users[1], offerHash, _amounts[2], _nonces[1], _v[1], _r[1], _s[1]);

        _fill(_users, _assets, _amounts);
    }

    function _fill(
        address[] memory _users, // _users[0]: maker, _users[1]: taker
        address[] memory _assets, // _assets[0]: offerAsset, _assets[1]: wantAsset
        uint256[] memory _amounts // _amounts[0]: offerAmount, _amounts[1]: wantAmount, _amounts[2]: takeAmount
    )
        private
    {
        // fillAmount / takeAmount = wantAmount / offerAmount
        // fillAmount = takeAmount * wantAmount / offerAmount
        uint256 fillAmount = (_amounts[2].mul(_amounts[1])).div(_amounts[0]);
        _decreaseBalance(_users[1], _assets[1], fillAmount);
        _increaseBalance(_users[0], _assets[1], fillAmount);
        _increaseBalance(_users[1], _assets[0], _amounts[2]);

        emit BalanceDecrease(_users[1], _assets[1], fillAmount);
        emit BalanceIncrease(_users[0], _assets[1], fillAmount);
        emit BalanceIncrease(_users[1], _assets[0], _amounts[2]);
    }

    function _makeOffer(
        address[] memory _users, // _users[0]: maker, _users[1]: taker
        address[] memory _assets, // _assets[0]: offerAsset, _assets[1]: wantAsset
        uint256[] memory _amounts, // _amounts[0]: offerAmount, _amounts[1]: wantAmount, _amounts[2]: takeAmount
        uint64 _offerNonce, // _nonces[0]: offerNonce, _nonces[1]: fillNonce
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        private
        returns (bytes32)
    {
        bytes32 offerHash = keccak256(abi.encodePacked(
            "makeOffer",
            _users[0],
            _assets[0],
            _assets[1],
            _amounts[0],
            _amounts[1],
            _offerNonce
        ));

        require(_recoverAddress(offerHash, _v, _r, _s) == _users[0], 'Invalid signature');

        offers[offerHash] = usedHashes[offerHash] ? offers[offerHash].sub(_amounts[2]) : _amounts[0];

        // make offer by deducting offer amount from user
        if (usedHashes[offerHash] == false) {
            _decreaseBalance(_users[0], _assets[0], _amounts[0]);
            usedHashes[offerHash] = true;
            emit BalanceDecrease(_users[0], _assets[0], _amounts[0]);
        }

        return offerHash;
    }

    function _decreaseBalance(address _user, address _asset, uint256 _amount) private {
        balances[_user][_asset] = balances[_user][_asset].sub(_amount);
    }

    function _increaseBalance(address _user, address _asset, uint256 _amount) private {
        balances[_user][_asset] = balances[_user][_asset].add(_amount);
    }

    function _validateFill(
        address _taker,
        bytes32 _offerHash,
        uint256 _takeAmount,
        uint64 _fillNonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        private
    {
        bytes32 fillHash = keccak256(abi.encodePacked(
            "fillOffer",
            _taker,
            _offerHash,
            _takeAmount,
            _fillNonce
        ));

        require(_recoverAddress(fillHash, _v, _r, _s) == _taker, 'Invalid signature');

        // require fillHash to be unused
        require(usedHashes[fillHash] == false, "Hash already used");
        usedHashes[fillHash] = true;
    }

    function _recoverAddress(bytes32 _hash, uint8 _v, bytes32 _r, bytes32 _s)
        private
        pure
        returns (address)
    {
        bytes32 prefixedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash));
        return ecrecover(prefixedHash, _v, _r, _s);
    }
}
        /* address[] calldata _users, // _users[0]: maker, _users[1]: taker
        address[] calldata _assets, // _assets[0]: offerAsset, _assets[1]: wantAsset
        uint256[] calldata _amounts, // _amounts[0]: offerAmount, _amounts[1]: wantAmount, _amounts[2]: takeAmount
        uint64[] calldata _nonces, // _nonces[0]: offerNonce, _nonces[1]: fillNonce
        uint8[] calldata _v, // _v[0]: maker sig, _v[1]: taker sig
        bytes32[] calldata _r, // _r[0]: maker sig, _r[1]: taker sig
        bytes32[] calldata _s // _s[0]: maker sig, _s[1]: taker sig */
