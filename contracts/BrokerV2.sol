pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";
import "./lib/ownership/Ownable.sol";

interface ERC20Token {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC1820Registry {
    function setInterfaceImplementer(address account, bytes32 interfaceHash, address implementer) external;
}

interface BrokerValidator {
    function validateTrades(uint256[] calldata _values, bytes32[] calldata _hashes, address[] calldata _addresses, address _operator) external;
}

contract BrokerV2 is Ownable {
    using SafeMath for uint256;

    struct WithdrawalAnnouncement {
        uint256 amount;
        uint256 withdrawableAt;
    }

    enum State { Active, Inactive }
    enum AdminState { Normal, Escalated }

    /* bytes32 public constant CONTRACT_NAME = keccak256("Switcheo Exchange");
    bytes32 public constant CONTRACT_VERSION = keccak256("2");
    // TODO: update this before deployment
    uint256 public constant CHAIN_ID = 3;
    // TODO: pre-calculate and update this before deployment
    address public constant VERIFYING_CONTRACT = address(1);
    bytes32 public constant SALT = keccak256("switcheo-eth-eip712-salt"); */

    bytes32 public constant EIP712_DOMAIN_TYPEHASH = 0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472;
    /* bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(
        "EIP712Domain(",
            "string name,",
            "string version,",
            "uint256 chainId,",
            "address verifyingContract,",
            "bytes32 salt",
        ")"
    )); */

    bytes32 public constant DOMAIN_SEPARATOR = 0x14f697e312cdba1c10a1eb5c87d96fa22b63aef9dc39592568387471319ea630;
    /* bytes32 public constant DOMAIN_SEPARATOR = keccak256(abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        CONTRACT_NAME,
        CONTRACT_VERSION,
        CHAIN_ID,
        VERIFYING_CONTRACT,
        SALT
    )); */

    bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = 0xe26b1365004fe3cb06fb24dd69b50c8263f0a5a1df21e0a76f4d6184c3515d50;
    /* bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = keccak256(abi.encodePacked(
        "AuthorizeSpender(",
            "address user,",
            "address spender,",
            "uint256 nonce",
        ")"
    )); */

    bytes32 public constant WITHDRAW_TYPEHASH = 0x022201e899466f5f66e5c18267f163396774140999328264ade6a71fa5be02de;
    /* bytes32 public constant WITHDRAW_TYPEHASH = keccak256(abi.encodePacked(
        "Withdraw(",
            "address withdrawer,",
            "address assetId,",
            "uint256 amount,",
            "address feeAssetId,",
            "uint256 feeAmount,",
            "uint256 nonce",
        ")"
    )); */

    bytes32 public constant OFFER_TYPEHASH = 0xf845c83a8f7964bc8dd1a092d28b83573b35be97630a5b8a3b8ae2ae79cd9260;
    /* bytes32 public constant OFFER_TYPEHASH = keccak256(abi.encodePacked(
        "Offer(",
            "address maker,",
            "address offerAssetId,",
            "uint256 offerAmount,",
            "address wantAssetId,",
            "uint256 wantAmount,",
            "address feeAssetId,",
            "uint256 feeAmount,",
            "uint256 nonce",
        ")"
    )); */

    bytes32 public constant CANCEL_TYPEHASH = 0x46f6d088b1f0ff5a05c3f232c4567f2df96958e05457e6c0e1221dcee7d69c18;
    /* bytes32 public constant CANCEL_TYPEHASH = keccak256(abi.encodePacked(
        "Cancel(",
            "bytes32 offerHash,",
            "address feeAssetId,",
            "uint256 feeAmount,",
        ")"
    )); */

    bytes32 public constant FILL_TYPEHASH = 0x5f59dbc3412a4575afed909d028055a91a4250ce92235f6790c155a4b2669e99;
    /* bytes32 public constant FILL_TYPEHASH = keccak256(abi.encodePacked(
        "Fill(",
            "address filler,",
            "address offerAssetId,",
            "uint256 offerAmount,",
            "address wantAssetId,",
            "uint256 wantAmount,",
            "address feeAssetId,",
            "uint256 feeAmount,",
            "uint256 nonce",
        ")"
    )); */

    bytes32 public constant SWAP_TYPEHASH = 0x6ba9001457a287c210b728198a424a4222098d7fac48f8c5fb5ab10ef907d3ef;
    /* bytes32 public constant SWAP_TYPEHASH = keccak256(abi.encodePacked(
        "Swap(",
            "address maker,",
            "address taker,",
            "address assetId,",
            "uint256 amount,",
            "bytes32 hashedSecret,",
            "uint256 expiryTime,",
            "address feeAssetId,",
            "uint256 feeAmount,",
            "uint256 nonce",
        ")"
    )); */

    // Ether token "address" is set as the constant 0x00
    address private constant ETHER_ADDR = address(0);

    // deposits
    uint256 private constant REASON_DEPOSIT = 0x01;
    uint256 private constant REASON_MAKER_GIVE = 0x02;
    uint256 private constant REASON_FILLER_GIVE = 0x03;
    uint256 private constant REASON_FILLER_FEE_GIVE = 0x04;
    uint256 private constant REASON_FILLER_RECEIVE = 0x05;
    uint256 private constant REASON_MAKER_RECEIVE = 0x06;
    uint256 private constant REASON_FILLER_FEE_RECEIVE = 0x07;
    uint256 private constant REASON_MAKER_FEE_GIVE = 0x10;
    uint256 private constant REASON_MAKER_FEE_RECEIVE = 0x11;
    uint256 private constant REASON_WITHDRAW = 0x09;
    uint256 private constant REASON_WITHDRAW_FEE_GIVE = 0x14;
    uint256 private constant REASON_WITHDRAW_FEE_RECEIVE = 0x15;
    uint256 private constant REASON_CANCEL = 0x08;
    uint256 private constant REASON_CANCEL_FEE_GIVE = 0x12;
    uint256 private constant REASON_CANCEL_FEE_RECEIVE = 0x13;
    uint256 private constant REASON_SWAP_GIVE = 0x30;
    uint256 private constant REASON_SWAP_RECEIVE = 0x35;
    uint256 private constant REASON_SWAP_FEE_GIVE = 0x36;
    uint256 private constant REASON_SWAP_FEE_RECEIVE = 0x37;
    uint256 private constant REASON_SWAP_CANCEL_RECEIVE = 0x38;
    uint256 private constant REASON_SWAP_CANCEL_FEE_RECEIVE = 0x3B;
    uint256 private constant REASON_SWAP_CANCEL_FEE_REFUND = 0x3D;

    uint256 private constant MAX_SLOW_WITHDRAW_DELAY = 604800;


    State public state; // position 0
    AdminState public adminState; // position 1
    // The operator receives fees
    address public operator; // position 2

    uint256 public slowWithdrawDelay; // position 3
    uint256 public slowCancelDelay; // position 4

    BrokerValidator private validator;

    mapping(bytes32 => uint256) public offers; // position 5
    mapping(uint256 => uint256) public usedNonces; // position 6
    mapping(address => mapping(address => uint256)) public balances; // position 7

    mapping(address => bool) adminAddresses;
    mapping(bytes32 => bool) public atomicSwaps;
    mapping(address => bool) public tokenWhitelist;
    mapping(address => bool) public spenderWhitelist;
    mapping(address => mapping(address => bool)) public spenderAuthorizations;
    mapping(address => mapping(address => WithdrawalAnnouncement)) public withdrawlAnnouncements;

    // Emitted on any balance state transition (+ve)
    event BalanceIncrease(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 indexed reason,
        uint256 nonceA,
        uint256 nonceB
    );

    // Emitted on any balance state transition (-ve)
    event BalanceDecrease(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 indexed reason,
        uint256 nonceA,
        uint256 nonceB
    );

    event AuthorizeSpender(
        address indexed user,
        address indexed spender,
        uint256 nonce
    );

    event UnauthorizeSpender(address indexed user, address indexed spender);

    event TokenFallback(
        address indexed user,
        address indexed assetId,
        uint256 amount
    );

    event TokensReceived(
        address indexed user,
        address indexed assetId,
        uint256 amount
    );

    event AnnounceWithdraw(
        address indexed withdrawer,
        address indexed assetId,
        uint256 amount,
        uint256 withdrawableAt
    );

    event SlowWithdraw(
        address indexed withdrawer,
        address indexed assetId,
        uint256 amount
    );

    constructor(address validatorAddress) public {
        adminAddresses[msg.sender] = true;
        operator = msg.sender;

        slowWithdrawDelay = MAX_SLOW_WITHDRAW_DELAY;

        validator = BrokerValidator(validatorAddress);

        IERC1820Registry erc1820 = IERC1820Registry(
            0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
        );

        erc1820.setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );
    }

    modifier onlyAdmin() {
        require(adminAddresses[msg.sender], "Invalid sender");
        _;
    }

    modifier onlyActiveState() {
        require(state == State.Active, "Invalid state");
        _;
    }

    modifier onlyEscalatedAdminState() {
        require(adminState == AdminState.Escalated, "Invalid state");
        _;
    }

    function setState(State _state) external onlyOwner { state = _state; }
    function setAdminState(AdminState _state) external onlyOwner { adminState = _state; }

    function setOperator(address _operator) external onlyOwner {
        _validateAddress(operator);
        operator = _operator;
    }

    function setSlowWithdrawDelay(uint256 _delay) external onlyOwner {
        require(_delay <= MAX_SLOW_WITHDRAW_DELAY, "Invalid delay");
        slowWithdrawDelay = _delay;
    }

    function addAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        require(!adminAddresses[_admin], "Admin already added");
        adminAddresses[_admin] = true;
    }

    function removeAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        require(adminAddresses[_admin], "Admin not yet added");
        delete adminAddresses[_admin];
    }

    function whitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        require(!tokenWhitelist[_assetId], "Token already whitelisted");
        tokenWhitelist[_assetId] = true;
    }

    function unwhitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        require(tokenWhitelist[_assetId], "Token not yet whitelisted");
        delete tokenWhitelist[_assetId];
    }

    function whitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        require(!spenderWhitelist[_spender], "Spender already added");
        spenderWhitelist[_spender] = true;
    }

    function unwhitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        require(spenderWhitelist[_spender], "Spender not yet added");
        delete spenderWhitelist[_spender];
    }

    function authorizeSpender(
        address _user,
        address _spender,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bool _prefixedSignature
    )
        external
        onlyAdmin
    {
        require(spenderWhitelist[_spender], "Invalid spender");
        _markNonce(_nonce);

        _validateSignature(
            keccak256(abi.encode(
                AUTHORIZE_SPENDER_TYPEHASH,
                _user,
                _spender,
                _nonce
            )),
            _user,
            _v,
            _r,
            _s,
            _prefixedSignature
        );
        spenderAuthorizations[_user][_spender] = true;
        emit AuthorizeSpender(_user, _spender, _nonce);
    }

    function unauthorizeSpender(address _spender) external {
        require(!spenderWhitelist[_spender], "Spender still active");

        address user = msg.sender;
        require(
            spenderAuthorizations[user][_spender],
            "Spender not yet authorized"
        );

        delete spenderAuthorizations[user][_spender];
        emit UnauthorizeSpender(user, _spender);
    }

    function spendFrom(
        address _from,
        address _to,
        address _assetId,
        uint256 _amount
    )
        external
    {
        require(
            spenderAuthorizations[_from][msg.sender],
            "Spender not yet approved"
        );

        _validateAddress(_to);

        balances[_from][_assetId] = balances[_from][_assetId].sub(_amount);
        balances[_to][_assetId] = balances[_to][_assetId].add(_amount);
    }

    function deposit() external payable onlyActiveState {
        require(msg.value > 0, "Invalid value");
        _increaseBalance(msg.sender, ETHER_ADDR, msg.value, REASON_DEPOSIT, 0, 0);
    }

    function depositToken(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _expectedAmount,
        uint256 _nonce
    )
        external
        onlyAdmin
        onlyActiveState
    {
        require(
            tokenWhitelist[_assetId] == false,
            "Whitelisted tokens cannot use this method of transfer"
        );
        _markNonce(_nonce);

        _increaseBalance(
            _user,
            _assetId,
            _expectedAmount,
            REASON_DEPOSIT,
            _nonce,
            0
        );

        _validateContractAddress(_assetId);

        ERC20Token token = ERC20Token(_assetId);
        uint256 initialBalance = token.balanceOf(address(this));

        // ERC20Token cannot be used for transferFrom calls because some
        // tokens have a transferFrom which returns a boolean and some do not
        // having two overloaded transferFrom methods does not work
        // as the signatures are the same but the return values are not
        bytes memory payload = abi.encodeWithSignature(
            "transferFrom(address,address,uint256)",
            _user,
            address(this),
            _amount
        );
        bytes memory returnData = _callContract(_assetId, payload);
        // ensure that asset transfer succeeded
        _validateTransferResult(returnData);

        uint256 finalBalance = token.balanceOf(address(this));
        uint256 transferredAmount = finalBalance.sub(initialBalance);

        require(
            transferredAmount == _expectedAmount,
            "Invalid transferred amount"
        );
    }

    // ERC223
    function tokenFallback(
        address _user,
        uint _amount,
        bytes calldata /* _data */
    )
        external
        onlyActiveState
    {
        address assetId = msg.sender;
        require(tokenWhitelist[assetId] == true, "Token not whitelisted");
        _increaseBalance(_user, assetId, _amount, REASON_DEPOSIT, 0, 0);
        emit TokenFallback(_user, assetId, _amount);
    }

    // ERC777
    function tokensReceived(
        address /* _operator */,
        address _user,
        address _to,
        uint _amount,
        bytes calldata /* _userData */,
        bytes calldata /* _operatorData */
    )
        external
        onlyActiveState
    {
        if (_to != address(this)) { return; }
        address assetId = msg.sender;
        require(tokenWhitelist[assetId] == true, "Token not whitelisted");
        _increaseBalance(_user, assetId, _amount, REASON_DEPOSIT, 0, 0);
        emit TokensReceived(_user, assetId, _amount);
    }

    // values = [
    //    * at index 0
    //    lengths // [0]
    //        numOffers, // bits(0..8)
    //        numFills, // bits(8..16)
    //        numMatches, // bits(16..24)
    //
    //    * starting at index 1
    //    * nonces must be sorted in ascending order
    //    offer.dataA // [i]
    //        makerIndex, // bits(0..8)
    //        maker.offerAssetIndex, // bits(8..16)
    //        maker.wantAssetIndex, // bits(16..24)
    //        maker.feeAssetIndex, // bits(24..32)
    //        operator.feeAssetIndex, // bits(32..40)
    //        offer.v // bits(40..48)
    //        offer.nonce // bits(48..128)
    //        offer.feeAmount // bits(128..256)
    //    offer.dataB // [i + 1]
    //        offer.offerAmount, // bits(0..128)
    //        offer.wantAmount, // bits(128..256)
    //
    //    * starting at index 1 + numOffers * 2
    //    * nonces must be sorted in ascending order
    //    fill.dataA // [i]
    //        fillerIndex, // bits(0..8)
    //        filler.offerAssetIndex, // bits(8..16)
    //        filler.wantAssetIndex, // bits(16..24)
    //        filler.feeAssetIndex, // bits(24..32)
    //        operator.feeAssetIndex, // bits(32..40)
    //        fill.v // bits(40..48)
    //        fill.nonce // bits(48..128)
    //        fill.feeAmount // bits(128..256)
    //    fill.dataB // [i + 1]
    //        fill.offerAmount, // bits(0..128)
    //        fill.wantAmount, // bits(128..256)
    //
    //    * starting at index 3 + numOffers * 5 + numFills * 5
    //    matchData
    //        match.offerIndex, // bits(0..8)
    //        match.fillIndex, // bits(6..16)
    //        match.takeAmount // bits(16..256)
    // ]
    //
    // hashes = [
    //     r, // 0
    //     s // 1
    // ]
    //
    // list of user addresses and assetIds
    // addresses = [
    //    account1,
    //    account2,
    //    assetId1,
    //    assetId2,
    // ]
    function trade(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses
    )
        external
        onlyAdmin
        onlyActiveState
    {
        // used to store the hash keys of each offer
        bytes32[] memory hashKeys = new bytes32[](_values[0] & ~(~uint256(0) << 8));

        validator.validateTrades(_values, _hashes, _addresses, operator);

        // validate data and signatures of all offer
        _validateTradeSignatures(
            _values,
            _hashes,
            _addresses,
            hashKeys,
            OFFER_TYPEHASH,
            0,
            _values[0] & ~(~uint256(0) << 8) // numOffers
        );

        // validate data and signatures of all fills
        _validateTradeSignatures(
            _values,
            _hashes,
            _addresses,
            new bytes32[](0),
            FILL_TYPEHASH,
            _values[0] & ~(~uint256(0) << 8), // numOffers
            (_values[0] & ~(~uint256(0) << 8)) + ((_values[0] & ~(~uint256(0) << 16)) >> 8) // numOffers + numFills
        );

        // INCREASE BALANCE OF FILLERS FOR FILL.WANT_AMOUNT (loop fills)
        // INCREASE BALANCE OF OPERATOR FOR FILL.FEE_AMOUNT (loop fills)
        _creditFillBalances(_values, _addresses);

        // INCREASE BALANCE OF MAKERS FOR RECEIVE_AMOUNT (loop matches)
        _creditMakerBalances(_values, _addresses);

        // INCREASE BALANCE OF OPERATOR FOR OFFER.FEE_AMOUNT (loop offers)
        _creditMakerFeeBalances(_values, _addresses);

        // DECREASE BALANCE OF FILLERS FOR FILL.OFFER_AMOUNT (loop fills)
        // DECREASE BALANCE OF FILLERS FOR FILL.FEE_AMOUNT (loop fills)
        _deductFillBalances(_values, _addresses);

        // DECREASE BALANCE OF MAKERS FOR OFFER.OFFER_AMOUNT (loop offers)
        // DECREASE BALANCE OF MAKERS FOR OFFER.FEE_AMOUNT (loop offers)
        _deductMakerBalances(_values, _addresses);

        // DECREASE OFFERS BY MATCH.TAKE_AMOUNT (loop matches)
        _storeOfferData(_values, hashKeys);

        // VALIDATE THAT FILL NONCES ARE NOT YET TAKEN (loop fills)
        // STORE FILL NONCES (loop fills)
        _storeFillNonces(_values);
    }

    // _values = [
    //     item0
    //         offerAmount // bits(0..128)
    //         wantAmount // bits(128..256)
    //     item1
    //         feeAmount // bits(0..128)
    //         cancelFeeAmount // bits(128..256)
    //     item2
    //         expectedAvailableAmount // bits(0..128)
    //         prefixedSignature // bits(128..136)
    //         v // bits(136..144)
    //         offerNonce // bits(144..256)
    //
    // _hashes = [
    //     r // 0
    //     s // 1
    // ]
    //
    // _addresses = [
    //     maker // 0
    //     offerAssetId // 1
    //     wantAssetId // 2
    //     feeAssetId // 3
    //     cancelFeeAssetId // 4
    // ]
    event Log(bool prefixedSignature, uint256 value, bool prefixedSignature2);
    function cancel(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses
    )
        external
        onlyAdmin
    {
        bytes32 offerHash = keccak256(abi.encode(
            OFFER_TYPEHASH,
            _addresses[0], // maker
            _addresses[1], // offerAssetId
            _values[0] & ~(~uint256(0) << 128), // offerAmount
            _addresses[2], // wantAssetId
            _values[0] >> 128, // wantAmount
            _addresses[3], // feeAssetId
            _values[1] & ~(~uint256(0) << 128), // feeAmount
            _values[2] >> 144 // offerNonce
        ));

        bytes32 cancelHash = keccak256(abi.encode(
            CANCEL_TYPEHASH,
            offerHash,
            _addresses[4],
            _values[1] >> 128
        ));

        bool prefixedSignature = ((_values[2] & ~(~uint256(1) << 136)) >> 128) != 0;
        emit Log(((_values[2] & ~(~uint256(1) << 136)) >> 128) != 0, ((_values[2] & ~(~uint256(1) << 136)) >> 128), prefixedSignature);
        /* _validateSignature(
            cancelHash,
            _addresses[0], // maker
            uint8((_values[2] & ~(~uint256(0) << 144)) >> 136), // v
            _hashes[0], // r
            _hashes[1], // s
            false // prefixedSignature
        ); */

        /* _cancel(
            _addresses[0], // maker
            offerHash,
            _values[2] & ~(~uint256(0) << 128), // expectedAvailableAmount
            _addresses[1], // offerAssetId
            _values[2] >> 144, // offerNonce
            _addresses[4], // cancelFeeAssetId
            _values[1] & ~(~uint256(0) << 128) // cancelFeeAmount
        ); */
    }

    function withdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bool _prefixedSignature
    )
        external
        onlyAdmin
    {
        _markNonce(_nonce);

        _validateSignature(
            keccak256(abi.encode(
                WITHDRAW_TYPEHASH,
                _withdrawer,
                _assetId,
                _amount,
                _feeAssetId,
                _feeAmount,
                _nonce
            )),
            _withdrawer,
            _v,
            _r,
            _s,
            _prefixedSignature
        );

        _withdraw(
            _withdrawer,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            _nonce
        );
    }

    function adminWithdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount
    )
        external
        onlyAdmin
        onlyEscalatedAdminState
    {
        _withdraw(_withdrawer, _assetId, _amount, address(0), 0, 0);
    }

    function announceWithdraw(
        address _assetId,
        uint256 _amount
    )
        external
    {
        require(
            _amount > 0 && _amount <= balances[msg.sender][_assetId],
            "Invalid amount"
        );

        WithdrawalAnnouncement storage announcement = withdrawlAnnouncements[msg.sender][_assetId];

        uint256 withdrawableAt = now + slowWithdrawDelay;
        announcement.withdrawableAt = withdrawableAt;
        announcement.amount = _amount;

        emit AnnounceWithdraw(msg.sender, _assetId, _amount, withdrawableAt);
    }

    function slowWithdraw(
        address payable _withdrawer,
        address _assetId
    )
        external
    {
        WithdrawalAnnouncement memory announcement = withdrawlAnnouncements[msg.sender][_assetId];
        uint256 amount = announcement.amount;

        require(amount > 0, "Invalid amount");
        require(
            announcement.withdrawableAt != 0 && announcement.withdrawableAt <= now,
            "Insufficient delay"
        );

        delete withdrawlAnnouncements[_withdrawer][_assetId];
        _withdraw(_withdrawer, _assetId, amount, address(0), 0, 0);
        emit SlowWithdraw(_withdrawer, _assetId, amount);
    }

    // _addresses => [0]: maker, [1]: taker, [2]: assetId, [3]: feeAssetId
    // _values => [0]: amount, [1]: expiryTime, [2]: feeAmount, [3]: nonce
    // _hashes => [0]: hashedSecret, [1]: r, [2]: s
    function createSwap(
        address[4] calldata _addresses,
        uint256[4] calldata _values,
        bytes32[3] calldata _hashes,
        uint8 _v,
        bool _prefixedSignature
    )
        external
        onlyAdmin
        onlyActiveState
    {
        require(_values[0] > 0, "Invalid amount");
        require(_values[1] > now, "Invalid expiry time");
        _markNonce(_values[3]);

        bytes32 swapHash = _hashSwap(_addresses, _values, _hashes[0]);

        require(!atomicSwaps[swapHash], "Invalid swap");
        _validateSignature(swapHash, _addresses[0], _v, _hashes[1], _hashes[2], _prefixedSignature);

        if (_addresses[3] == _addresses[2]) { // feeAssetId == assetId
            require(_values[2] < _values[0], "Invalid fee amount"); // feeAmount < amount
        } else {
            _decreaseBalance(
                _addresses[0], // maker
                _addresses[3], // feeAssetId
                _values[2], // feeAmount
                REASON_SWAP_FEE_GIVE,
                _values[3], // nonce
                0
            );
        }

        _decreaseBalance(
            _addresses[0], // maker
            _addresses[2], // assetId
            _values[0], // amount
            REASON_SWAP_GIVE,
            _values[3], // nonce
            0
        );

        atomicSwaps[swapHash] = true;
    }

    // _addresses => [0]: maker, [1]: taker, [2]: assetId, [3]: feeAssetId
    // _values => [0]: amount, [1]: expiryTime, [2]: feeAmount, [3]: nonce
    function executeSwap(
        address[4] calldata _addresses,
        uint256[4] calldata _values,
        bytes32 _hashedSecret,
        bytes calldata _preimage
    )
        external
    {
        bytes32 swapHash = _hashSwap(_addresses, _values, _hashedSecret);
        require(atomicSwaps[swapHash], "Swap is not active");
        require(
            sha256(abi.encodePacked(sha256(_preimage))) == _hashedSecret,
            "Invalid preimage"
        );

        uint256 takeAmount = _values[0];
        if (_addresses[3] == _addresses[2]) { // feeAssetId == assetId
            takeAmount = takeAmount.sub(_values[2]);
        }

        delete atomicSwaps[swapHash];

        _increaseBalance(
            _addresses[1], // taker
            _addresses[2], // assetId
            takeAmount,
            REASON_SWAP_RECEIVE,
            _values[3], // nonce
            0
        );

        _increaseBalance(
            operator,
            _addresses[3], // feeAssetId
            _values[2], // feeAmount
            REASON_SWAP_FEE_RECEIVE,
            _values[3], // nonce
            0
        );
    }

    // _addresses => [0]: maker, [1]: taker, [2]: assetId, [3]: feeAssetId
    // _values => [0]: amount, [1]: expiryTime, [2]: feeAmount, [3]: nonce
    function cancelSwap(
        address[4] calldata _addresses,
        uint256[4] calldata _values,
        bytes32 _hashedSecret,
        uint256 _cancelFeeAmount
    )
        external
    {
        require(_values[1] <= now, "Swap not yet expired");
        bytes32 swapHash = _hashSwap(_addresses, _values, _hashedSecret);
        require(atomicSwaps[swapHash], "Swap is not active");

        uint256 cancelFeeAmount = _cancelFeeAmount;
        if (!adminAddresses[msg.sender]) { cancelFeeAmount = _values[2]; }

        require(
            cancelFeeAmount <= _values[2], // cancelFeeAmount < feeAmount
            "Invalid cancel fee amount"
        );

        uint256 refundAmount = _values[0];
        if (_addresses[3] == _addresses[2]) { // feeAssetId == assetId
            refundAmount = refundAmount.sub(cancelFeeAmount);
        }

        delete atomicSwaps[swapHash];

        _increaseBalance(
            _addresses[0], // maker
            _addresses[2], // assetId
            refundAmount,
            REASON_SWAP_CANCEL_RECEIVE,
            _values[3], // nonce
            0
        );

        _increaseBalance(
            operator,
            _addresses[3], // feeAssetId
            cancelFeeAmount,
            REASON_SWAP_CANCEL_FEE_RECEIVE,
            _values[3],
            0
        );

        if (_addresses[3] != _addresses[2]) { // feeAssetId != assetId
            uint256 refundFeeAmount = _values[2].sub(cancelFeeAmount);
            _increaseBalance(
                _addresses[0], // maker
                _addresses[3], // feeAssetId
                refundFeeAmount,
                REASON_SWAP_CANCEL_FEE_REFUND,
                _values[3],
                0
            );
        }
    }

    function _validateTradeSignatures(
        uint256[] memory _values,
        bytes32[] memory _hashes,
        address[] memory _addresses,
        bytes32[] memory _hashKeys,
        bytes32 _typehash,
        uint256 _i,
        uint256 _end
    )
        private
        pure
    {
        for (_i; _i < _end; _i++) {
            uint256 dataA = _values[_i * 2 + 1];
            uint256 dataB = _values[_i * 2 + 2];
            address user = _addresses[(dataA & ~(~uint256(0) << 8)) * 2];

            bytes32 hashKey = keccak256(abi.encode(
                _typehash,
                user,
                _addresses[((dataA & ~(~uint256(0) << 16)) >> 8) * 2 + 1], // offerAssetId
                dataB & ~(~uint256(0) << 128), // offerAmount
                _addresses[((dataA & ~(~uint256(0) << 24)) >> 16) * 2 + 1], // wantAssetId
                dataB >> 128, // wantAmount
                _addresses[((dataA & ~(~uint256(0) << 32)) >> 24) * 2 + 1], // feeAssetId
                dataA >> 128, // feeAmount
                (dataA & ~(~uint256(0) << 128)) >> 48 // nonce
            ));

            bool prefixedSignature = _values[0] & (uint256(1) << (24 + _i)) != 0;

            _validateSignature(
                hashKey,
                user,
                uint8((dataA & ~(~uint256(0) << 48)) >> 40),
                _hashes[_i * 2],
                _hashes[_i * 2 + 1],
                prefixedSignature
            );

            if (_hashKeys.length > 0) {
                _hashKeys[_i] = hashKey;
            }
        }
    }

    function _creditFillBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory increments = new uint256[](_addresses.length / 2);

        // 1 + numOffers * 2
        uint256 i = 1 + (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i + numFills * 2
        uint256 end = i + ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        // loop fills
        for(i; i < end; i += 2) {
            uint256 wantAssetIndex = ((_values[i] & ~(~uint256(0) << 24)) >> 16);
            uint256 wantAmount = _values[i + 1] >> 128;

            increments[wantAssetIndex] = increments[wantAssetIndex].add(wantAmount);
            if (min > wantAssetIndex) { min = wantAssetIndex; }
            if (max < wantAssetIndex) { max = wantAssetIndex; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            uint256 feeAssetIndex = ((_values[i] & ~(~uint256(0) << 40)) >> 32);
            increments[feeAssetIndex] = increments[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        for(i = min; i <= max; i++) {
            uint256 increment = increments[i];
            if (increment > 0) {
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]] =
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]].add(increment);
            }
        }
    }

    function _creditMakerBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory increments = new uint256[](_addresses.length / 2);

        uint256 i = 1;
        // i += numOffers * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        // loop matches
        for(i; i < end; i++) {
            uint256 offerIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 wantAssetIndex = (_values[1 + offerIndex * 2] & ~(~uint256(0) << 24)) >> 16;

            // takeAmount
            uint256 amount = _values[i] >> 16;
            // receiveAmount = takeAmount * wantAmount / offerAmount
            amount = amount.mul(_values[2 + offerIndex * 2] >> 128)
                           .div(_values[2 + offerIndex * 2] & ~(~uint256(0) << 128));

            increments[wantAssetIndex] = increments[wantAssetIndex].add(amount);

            if (min > wantAssetIndex) { min = wantAssetIndex; }
            if (max < wantAssetIndex) { max = wantAssetIndex; }
        }

        for(i = min; i <= max; i++) {
            uint256 increment = increments[i];
            if (increment > 0) {
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]] =
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]].add(increment);
            }
        }
    }

    function _creditMakerFeeBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory increments = new uint256[](_addresses.length / 2);

        uint256 i = 1;
        // i + numOffers * 2
        uint256 end = i + (_values[0] & ~(~uint256(0) << 8)) * 2;

        // loop offers
        for(i; i < end; i += 2) {
            uint256 nonce = (_values[i] & ~(~uint256(0) << 128)) >> 48;
            if (_nonceTaken(nonce)) { continue; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            uint256 feeAssetIndex = (_values[i] & ~(~uint256(0) << 40)) >> 32;
            increments[feeAssetIndex] = increments[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        for(i = min; i <= max; i++) {
            uint256 increment = increments[i];
            if (increment > 0) {
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]] =
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]].add(increment);
            }
        }
    }

    function _deductFillBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory deductions = new uint256[](_addresses.length / 2);

        // 1 + numOffers * 2
        uint256 i = 1 + (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i + numFills * 2
        uint256 end = i + ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        // loop fills
        for(i; i < end; i += 2) {
            uint256 offerAssetIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;
            uint256 offerAmount = _values[i + 1] & ~(~uint256(0) << 128);

            deductions[offerAssetIndex] = deductions[offerAssetIndex].add(offerAmount);
            if (min > offerAssetIndex) { min = offerAssetIndex; }
            if (max < offerAssetIndex) { max = offerAssetIndex; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            uint256 feeAssetIndex = (_values[i] & ~(~uint256(0) << 32)) >> 24;
            deductions[feeAssetIndex] = deductions[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        for(i = min; i <= max; i++) {
            uint256 deduction = deductions[i];
            if (deduction > 0) {
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]] =
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]].sub(deduction);
            }
        }
    }

    function _deductMakerBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory deductions = new uint256[](_addresses.length / 2);

        uint256 i = 1;
        // i + numOffers * 2
        uint256 end = i + (_values[0] & ~(~uint256(0) << 8)) * 2;

        // loop offers
        for(i; i < end; i += 2) {
            uint256 nonce = (_values[i] & ~(~uint256(0) << 128)) >> 48;
            if (_nonceTaken(nonce)) { continue; }

            uint256 offerAssetIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;
            uint256 offerAmount = _values[i + 1] & ~(~uint256(0) << 128);

            deductions[offerAssetIndex] = deductions[offerAssetIndex].add(offerAmount);
            if (min > offerAssetIndex) { min = offerAssetIndex; }
            if (max < offerAssetIndex) { max = offerAssetIndex; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            uint256 feeAssetIndex = (_values[i] & ~(~uint256(0) << 32)) >> 24;
            deductions[feeAssetIndex] = deductions[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        for(i = min; i <= max; i++) {
            uint256 deduction = deductions[i];
            if (deduction > 0) {
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]] =
                balances[_addresses[i * 2]][_addresses[i * 2 + 1]].sub(deduction);
            }
        }
    }

    function _storeOfferData(
        uint256[] memory _values,
        bytes32[] memory _hashKeys
    )
        private
    {
        // deductions with size numOffers
        uint256[] memory deductions = new uint256[](_values[0] & ~(~uint256(0) << 8));

        uint256 i = 1;
        // i += numOffers * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        // loop matches
        for (i; i < end; i++) {
            uint256 offerIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 takeAmount = _values[i] >> 16;
            deductions[offerIndex] = deductions[offerIndex].add(takeAmount);
        }

        i = 0;
        end = _values[0] & ~(~uint256(0) << 8); // numOffers

        // loop offers
        for (i; i < end; i++) {
            uint256 nonce = (_values[i * 2 + 1] & ~(~uint256(0) << 128)) >> 48;
            bool existingOffer = _nonceTaken(nonce);
            bytes32 hashKey = _hashKeys[i];

            uint256 availableAmount = existingOffer ? offers[hashKey] : (_values[i * 2 + 2] & ~(~uint256(0) << 128));
            require(availableAmount > 0, "Invalid availableAmount");

            uint256 remainingAmount = availableAmount.sub(deductions[i]);
            if (remainingAmount > 0) { offers[hashKey] = remainingAmount; }
            if (existingOffer && remainingAmount == 0) { delete offers[hashKey]; }

            _softMarkNonce(nonce);
        }
    }

    function _storeFillNonces(uint256[] memory _values) private {
        // 1 + numOffers * 2
        uint256 i = 1 + (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i + numFills * 2
        uint256 end = i + ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        // loop fills
        for(i; i < end; i += 2) {
            uint256 nonce = (_values[i] & ~(~uint256(0) << 128)) >> 48;
            _markNonce(nonce);
        }
    }

    function _cancel(
        address _maker,
        bytes32 _offerHash,
        uint256 _expectedAvailableAmount,
        address _offerAssetId,
        uint256 _offerNonce,
        address _cancelFeeAssetId,
        uint256 _cancelFeeAmount
    )
        private
    {
        uint256 refundAmount = offers[_offerHash];
        require(refundAmount > 0, "Invalid offerHash");
        require(refundAmount == _expectedAvailableAmount);

        delete offers[_offerHash];

        if (_cancelFeeAssetId == _offerAssetId) {
            refundAmount = refundAmount.sub(_cancelFeeAmount);
        } else {
            _decreaseBalance(
                _maker,
                _cancelFeeAssetId,
                _cancelFeeAmount,
                REASON_CANCEL_FEE_GIVE,
                _offerNonce,
                0
            );
        }

        _increaseBalance(
            _maker, // maker
            _offerAssetId, // offerAssetId
            refundAmount,
            REASON_CANCEL,
            _offerNonce, // offer nonce
            0
        );

        _increaseBalance(
            operator,
            _cancelFeeAssetId,
            _cancelFeeAmount,
            REASON_CANCEL_FEE_RECEIVE,
            _offerNonce, // offer nonce
            0
        );
    }

    function _withdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _nonce
    )
        private
    {
        require(_amount > 0, 'Invalid amount');

        _decreaseBalance(
            _withdrawer,
            _assetId,
            _amount,
            REASON_WITHDRAW,
            _nonce,
            0
        );

        _increaseBalance(
            operator,
            _feeAssetId,
            _feeAmount,
            REASON_WITHDRAW_FEE_RECEIVE,
            _nonce,
            0
        );

        uint256 withdrawAmount;

        if (_feeAssetId == _assetId) {
            withdrawAmount = _amount.sub(_feeAmount);
        } else {
            _decreaseBalance(
                _withdrawer,
                _feeAssetId,
                _feeAmount,
                REASON_WITHDRAW_FEE_GIVE,
                _nonce,
                0
            );
            withdrawAmount = _amount;
        }

        if (_assetId == ETHER_ADDR) {
            _withdrawer.transfer(withdrawAmount);
            return;
        }

        _validateContractAddress(_assetId);

        bytes memory payload = abi.encodeWithSignature(
                                   "transfer(address,uint256)",
                                   _withdrawer,
                                   withdrawAmount
                               );
        bytes memory returnData = _callContract(_assetId, payload);

        // ensure that asset transfer succeeded
        _validateTransferResult(returnData);
    }

    function _hashSwap(
        address[4] memory _addresses,
        uint256[4] memory _values,
        bytes32 _hashedSecret
    )
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(
            SWAP_TYPEHASH,
            _addresses[0], // maker
            _addresses[1], // taker
            _addresses[2], // assetId
            _values[0], // amount
            _hashedSecret, // hashedSecret
            _values[1], // expiryTime
            _addresses[3], // feeAssetId
            _values[2], // feeAmount
            _values[3] // nonce
        ));
    }

    function _nonceTaken(uint256 _nonce) private view returns (bool) {
        uint256 slotData = _nonce.div(256);
        uint256 shiftedBit = 1 << _nonce.mod(256);
        uint256 bits = usedNonces[slotData];

        return bits & shiftedBit != 0;
    }

    function _markNonce(uint256 _nonce) private {
        require(_nonce != 0, "Invalid nonce");

        uint256 slotData = _nonce.div(256);
        uint256 shiftedBit = 1 << _nonce.mod(256);
        uint256 bits = usedNonces[slotData];

        require(bits & shiftedBit == 0, "Nonce already used");

        usedNonces[slotData] = bits | shiftedBit;
    }

    function _softMarkNonce(uint256 _nonce) private {
        require(_nonce != 0, "Invalid nonce");

        uint256 slotData = _nonce.div(256);
        uint256 shiftedBit = uint256(1) << _nonce.mod(256);
        uint256 bits = usedNonces[slotData];

        if (bits & shiftedBit != 0) { return; }
        usedNonces[slotData] = bits | shiftedBit;
    }

    function _validateSignature(
        bytes32 _hash,
        address _user,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bool _prefixed
    )
        private
        pure
    {
        bytes32 eip712Hash = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            _hash
        ));

        if (_prefixed) {
            bytes32 prefixedHash = keccak256(abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                eip712Hash
            ));
            require(_user == ecrecover(prefixedHash, _v, _r, _s), "Invalid signature");
        } else {
            require(_user == ecrecover(eip712Hash, _v, _r, _s), "Invalid signature");
        }
    }

    function _callContract(
        address _contract,
        bytes memory _payload
    )
        private
        returns (bytes memory)
    {
        bool success;
        bytes memory returnData;

        (success, returnData) = _contract.call(_payload);
        require(success, "contract call failed");

        return returnData;
    }

    function _increaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode,
        uint256 _nonceA,
        uint256 _nonceB
    )
        private
    {
        if (_amount == 0) { return; }
        balances[_user][_assetId] = balances[_user][_assetId].add(_amount);
        emit BalanceIncrease(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonceA,
            _nonceB
        );
    }

    function _decreaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode,
        uint256 _nonceA,
        uint256 _nonceB
    )
        private
    {
        _decreaseBalance(_user, _assetId, _amount);

        emit BalanceDecrease(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonceA,
            _nonceB
        );
    }

    function _decreaseBalance(
        address _user,
        address _assetId,
        uint256 _amount
    )
        private
    {
        if (_amount == 0) { return; }
        balances[_user][_assetId] = balances[_user][_assetId].sub(_amount);
    }

    function _validateAddress(address _address) private pure {
        require(
            _address != address(0),
            'Invalid address'
        );
    }

    /// @dev Ensure that the address is a deployed contract
    function _validateContractAddress(address _contract) private view {
        assembly {
            if iszero(extcodesize(_contract)) { revert(0, 0) }
        }
    }

    /// @dev Fix for ERC-20 tokens that do not have proper return type
    /// See: https://github.com/ethereum/solidity/issues/4116
    /// https://medium.com/loopring-protocol/an-incompatibility-in-smart-contract-threatening-dapp-ecosystem-72b8ca5db4da
    /// https://github.com/sec-bit/badERC20Fix/blob/master/badERC20Fix.sol
    function _validateTransferResult(bytes memory _data) private pure {
        require(
            _data.length == 0 ||
            (_data.length == 32 && _getUint256FromBytes(_data) != 0),
            "Invalid transfer"
        );
    }

    function _getUint256FromBytes(
        bytes memory _data
    )
        private
        pure
        returns (uint256)
    {
        uint256 parsed;
        assembly { parsed := mload(add(_data, 32)) }
        return parsed;
    }
}
