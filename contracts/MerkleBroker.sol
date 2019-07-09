pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract MerkleBroker {
    using SafeMath for uint256;

    address public coordinator;

    mapping(address => mapping(address => uint256)) public balances;
    mapping(bytes32 => uint256) public offers;
    mapping(bytes32 => uint256) public usedNonces;

    event BalanceIncrease(address indexed user, address indexed asset, uint256 amount);
    event BalanceDecrease(address indexed user, address indexed asset, uint256 amount);

    constructor() public {
        coordinator = msg.sender;
    }

    function deposit(address _user, address _asset, uint256 _amount) external {
        _increaseBalance(_user, _asset, _amount);
    }

    function withdraw(address _user, address _asset, uint256 _amount) external {
        _decreaseBalance(_user, _asset, _amount);
    }

    function batchTrade(
        address[] calldata _addresses, // _addresses[0]: maker, _addresses[1]: taker, _addresses[2]: offerAsset, _addresses[3]: wantAsset, _addresses[4]: feeAsset
        uint256[] calldata _values, // _values[0]: offerAmount, _values[1]: wantAmount, _values[2]: takeAmount, _values[3]: feeAmount, _values[4]: offerNonce, _values[5]: fillNonce
        uint8[] calldata _v,
        bytes32[] calldata _r,
        bytes32[] calldata _s
    )
        external
    {
        for (uint32 i = 0; i < _v.length.div(2); i++) {
            trade(
                [_addresses[i * 5], _addresses[i * 5 + 1], _addresses[i * 5 + 2], _addresses[i * 5 + 3], _addresses[i * 5 + 4]],
                [_values[i * 6], _values[i * 6 + 1], _values[i * 6 + 2], _values[i * 6 + 3], _values[i * 6 + 4], _values[i * 6 + 5]],
                [_v[i * 2], _v[i * 2 + 1]],
                [_r[i * 2], _r[i * 2 + 1]],
                [_s[i * 2], _s[i * 2 + 1]]
            );
        }
    }

    function trade(
        address[5] memory _addresses, // _addresses[0]: maker, _addresses[1]: taker, _addresses[2]: offerAsset, _addresses[3]: wantAsset, _addresses[4]: feeAsset
        uint256[6] memory _values, // _values[0]: offerAmount, _values[1]: wantAmount, _values[2]: takeAmount, _values[3]: feeAmount, _values[4]: offerNonce, _values[5]: fillNonce
        uint8[2] memory _v,
        bytes32[2] memory _r,
        bytes32[2] memory _s
    )
        public
    {
        bytes32 offerHash = _makeOffer(_addresses, _values, _v[0], _r[0], _s[0]);
        _validateFill(offerHash, _addresses, _values, _v[1], _r[1], _s[1]);
        _fill(_addresses, _values);
    }

    function markNonce(uint256 _nonce) external {
        _markNonceAsUsed(_nonce);
    }

    function _markNonceAsUsed(uint256 _nonce) private {
        uint256 compactedNonce = _nonce.div(256);
        uint256 remainder = _nonce.sub(compactedNonce.mul(256));
        bytes32 nonceHash = keccak256(abi.encodePacked(compactedNonce));
        usedNonces[nonceHash] = usedNonces[nonceHash] | (2 ** remainder);
    }

    function _nonceIsUsed(uint256 _nonce) private view returns(bool) {
        uint256 compactedNonce = _nonce.div(256);
        uint256 remainder = _nonce.sub(compactedNonce.mul(256));
        bytes32 nonceHash = keccak256(abi.encodePacked(compactedNonce));
        return usedNonces[nonceHash] & (2 ** remainder) != 0;
    }

    function _fill(
        address[5] memory _addresses, // _addresses[0]: maker, _addresses[1]: taker, _addresses[2]: offerAsset, _addresses[3]: wantAsset, _addresses[4]: feeAsset
        uint256[6] memory _values // _values[0]: offerAmount, _values[1]: wantAmount, _values[2]: takeAmount, _values[3]: feeAmount, _values[4]: offerNonce, _values[5]: fillNonce
    )
        private
    {
        // fillAmount / takeAmount = wantAmount / offerAmount
        // fillAmount = takeAmount * wantAmount / offerAmount
        uint256 fillAmount = (_values[2].mul(_values[1])).div(_values[0]);
        // reduce taker balance for offer.wantAsset
        _decreaseBalance(_addresses[1], _addresses[3], fillAmount);
        // increase maker balance for offer.wantAsset
        _increaseBalance(_addresses[0], _addresses[3], fillAmount);

        // if offer.offerAsset == fill.feeAsset then reduce receiveAmount by fillAmount
        uint256 receiveAmount = _addresses[2] == _addresses[4] ? _values[2].sub(_values[3]) : _values[2];

        // increase taker balance for offer.offerAsset
        _increaseBalance(_addresses[1], _addresses[2], receiveAmount);

        // if offer.offerAsset != fill.feeAsset then reduce taker balance for feeAsset by feeAmount
        if (_addresses[2] != _addresses[4]) { _decreaseBalance(_addresses[1], _addresses[4], _values[3]); }

        // increase coordinator balance for fill.feeAsset
        _increaseBalance(coordinator, _addresses[4], _values[3]);
    }

    function _makeOffer(
        address[5] memory _addresses, // _addresses[0]: maker, _addresses[1]: taker, _addresses[2]: offerAsset, _addresses[3]: wantAsset, _addresses[4]: feeAsset
        uint256[6] memory _values, // _values[0]: offerAmount, _values[1]: wantAmount, _values[2]: takeAmount, _values[3]: feeAmount, _values[4]: offerNonce, _values[5]: fillNonce
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        private
        returns (bytes32)
    {
        bytes32 offerHash = keccak256(abi.encodePacked(
            "makeOffer",
            _addresses[0], // maker
            _addresses[2], // offerAsset
            _addresses[3], // wantAsset
            _values[0], // offerAmount
            _values[1], // wantAmount
            _values[4] // offerNonce
        ));

        require(_recoverAddress(offerHash, _v, _r, _s) == _addresses[0], 'Invalid signature');

        bool isNewOffer = _nonceIsUsed(_values[4]) == false;
        offers[offerHash] =  isNewOffer ? _values[0] : offers[offerHash].sub(_values[2]);

        // make offer by deducting offer amount from user
        if (isNewOffer) {
            _decreaseBalance(_addresses[0], _addresses[2], _values[0]);
            _markNonceAsUsed(_values[4]);
        }

        return offerHash;
    }

    function _decreaseBalance(address _user, address _asset, uint256 _amount) private {
        if (_amount == 0) { return; }
        balances[_user][_asset] = balances[_user][_asset].sub(_amount);
        emit BalanceDecrease(_user, _asset, _amount);
    }

    function _increaseBalance(address _user, address _asset, uint256 _amount) private {
        if (_amount == 0) { return; }
        balances[_user][_asset] = balances[_user][_asset].add(_amount);
        emit BalanceIncrease(_user, _asset, _amount);
    }

    function _validateFill(
        bytes32 _offerHash,
        address[5] memory _addresses, // _addresses[0]: maker, _addresses[1]: taker, _addresses[2]: offerAsset, _addresses[3]: wantAsset, _addresses[4]: feeAsset
        uint256[6] memory _values, // _values[0]: offerAmount, _values[1]: wantAmount, _values[2]: takeAmount, _values[3]: feeAmount, _values[4]: offerNonce, _values[5]: fillNonce
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        private
    {
        bytes32 fillHash = keccak256(abi.encodePacked(
            "fillOffer",
            _addresses[1], // taker
            _offerHash, // offerHash
            _values[2], // takeAmount
            _addresses[4], // feeAsset
            _values[3], // feeAmount
            _values[5] // fillNonce
        ));

        require(_recoverAddress(fillHash, _v, _r, _s) == _addresses[1], 'Invalid signature');
        // require fillNonce to be unused
        require(_nonceIsUsed(_values[5]) == false, "Nonce already used");
        _markNonceAsUsed(_values[5]);
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
