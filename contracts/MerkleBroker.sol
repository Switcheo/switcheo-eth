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
        uint64[] calldata _nonces // _nonces[0]: offerNonce, _nonces[1]: fillNonce
    )
        external
    {
        bytes32 offerHash = keccak256(abi.encodePacked(
            "makeOffer",
            _users[0], // maker
            _assets[0], // offerAsset
            _assets[1], // wantAsset
            _amounts[0], // offerAmount
            _amounts[1], // wantAmount
            _nonces[0] // offerNonce
        ));

        bytes32 fillHash = keccak256(abi.encodePacked(
            "fillOffer",
            _users[1], // taker
            offerHash, // offerHash
            _amounts[2], // takeAmount
            _nonces[1] // fillNonce
        ));

        // require fillHash to be unused
        require(usedHashes[fillHash] == false, "Hash already used")
        usedHashes[fillHash] = true

        uint256 availableAmount = usedHashes[offerHash] ? offers[offerHash] : _amounts[0]

        // make offer by deducting offer amount from user
        if (usedHashes[offerHash] == false) {
            balances[_users[0]][_assets[0]] = balances[_users[0]][_assets[0]].sub(_amounts[0]);
            usedHashes[offerHash] = true;
        }

        // fillAmount / takeAmount = wantAmount / offerAmount
        // fillAmount = takeAmount * wantAmount / offerAmount
        uint256 fillAmount = (_amounts[2].mul(_amounts[1])).div(_amounts[0]);

        // deduct fillAmount from taker
        balances[_users[1]][_assets[1]] = balances[_users[1]][_assets[1]].sub(fillAmount);

        // credit maker for fillAmount
        balances[_users[0]][_assets[1]] = balances[_users[0]][_assets[1]].add(fillAmount);

        // reduce available offer amount
        offers[offerHash] = availableAmount.sub(_amounts[2]);

        // credit taker for takeAmount
        balances[_users[1]][_assets[0]] = balances[_users[1]][_assets[0]].add(_amounts[2]);

        emit BalanceDecrease(_users[1], _assets[1], fillAmount);
        emit BalanceIncrease(_users[0], _assets[1], fillAmount);
        emit BalanceDecrease(_users[1], _assets[1], _amounts[2]);
    }
}
        /* address[] calldata _users, // _users[0]: maker, _users[1]: taker
        address[] calldata _assets, // _assets[0]: offerAsset, _assets[1]: wantAsset
        uint256[] calldata _amounts, // _amounts[0]: offerAmount, _amounts[1]: wantAmount, _amounts[2]: takeAmount
        uint64[] calldata _nonces, // _nonces[0]: offerNonce, _nonces[1]: fillNonce
        uint8[] calldata _v, // _v[0]: maker sig, _v[1]: taker sig
        bytes32[] calldata _r, // _r[0]: maker sig, _r[1]: taker sig
        bytes32[] calldata _s // _s[0]: maker sig, _s[1]: taker sig */
