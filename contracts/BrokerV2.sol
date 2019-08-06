pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";
import "./lib/ownership/Ownable.sol";
import "./lib/introspection/IERC1820Registry.sol";

contract ERC20Token {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract BrokerV2 is Ownable {
    using SafeMath for uint256;

    struct WithdrawalAnnouncement {
        uint256 amount;
        uint256 withdrawableAt;
    }

    enum State { Active, Inactive }
    enum AdminState { Normal, Escalated }

    bytes32 public constant CONTRACT_NAME = keccak256("Switcheo Exchange");
    bytes32 public constant CONTRACT_VERSION = keccak256("2");
    // TODO: update this before deployment
    uint256 public constant CHAIN_ID = 3;
    // TODO: pre-calculate and update this before deployment
    address public constant VERIFYING_CONTRACT = address(1);
    bytes32 public constant SALT = keccak256("switcheo-eth-eip712-salt");

    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(
        "EIP712Domain(",
            "string name,",
            "string version,",
            "uint256 chainId,",
            "address verifyingContract,",
            "bytes32 salt",
        ")"
    ));

    // DOMAIN_SEPARATOR: 0x14f697e312cdba1c10a1eb5c87d96fa22b63aef9dc39592568387471319ea630
    bytes32 public constant DOMAIN_SEPARATOR = keccak256(abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        CONTRACT_NAME,
        CONTRACT_VERSION,
        CHAIN_ID,
        VERIFYING_CONTRACT,
        SALT
    ));

    bytes32 public constant AUTHORIZE_SPENDER_TYPEHASH = keccak256(abi.encodePacked(
        "AuthorizeSpender(",
            "address user,",
            "address spender,",
            "uint256 nonce",
        ")"
    ));

    bytes32 public constant WITHDRAW_TYPEHASH = keccak256(abi.encodePacked(
        "Withdraw(",
            "address withdrawer,",
            "address assetId,",
            "uint256 amount,",
            "address feeAssetId,",
            "uint256 feeAmount,",
            "uint256 nonce",
        ")"
    ));

    // OFFER_TYPEHASH: 0xf845c83a8f7964bc8dd1a092d28b83573b35be97630a5b8a3b8ae2ae79cd9260
    bytes32 public constant OFFER_TYPEHASH = keccak256(abi.encodePacked(
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
    ));

    bytes32 public constant FILL_TYPEHASH = keccak256(abi.encodePacked(
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
    ));

    bytes32 public constant SWAP_TYPEHASH = keccak256(abi.encodePacked(
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
    ));

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

    event AddAdmin(address indexed admin);
    event RemoveAdmin(address indexed admin);
    event WhitelistToken(address indexed assetId);
    event UnwhitelistToken(address indexed assetId);
    event AddSpender(address indexed spender);
    event RemoveSpender(address indexed spender);

    event AuthorizeSpender(
        address indexed user,
        address indexed spender,
        uint256 nonce
    );

    event UnauthorizeSpender(address indexed user, address indexed spender);

    event SpendFrom(
        address indexed from,
        address indexed to,
        address indexed assetId,
        uint256 amount
    );

    event Deposit(address indexed user, uint256 amount);

    event DepositToken(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 nonce
    );

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

    event Withdraw(
        address withdrawer,
        address assetId,
        uint256 amount,
        address feeAssetId,
        uint256 feeAmount,
        uint256 nonce
    );

    event AdminWithdraw(
        address indexed withdrawer,
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

    event CreateSwap(
        address indexed maker,
        address indexed taker,
        address assetId,
        uint256 amount,
        bytes32 indexed hashedSecret,
        uint256 expiryTime,
        address feeAsset,
        uint256 feeAmount,
        uint256 nonce
    );

    event ExecuteSwap(
        address indexed maker,
        address indexed taker,
        address assetId,
        uint256 amount,
        bytes32 indexed hashedSecret,
        uint256 expiryTime,
        address feeAsset,
        uint256 feeAmount,
        uint256 nonce,
        bytes preimage
    );

    event CancelSwap(
        address indexed maker,
        address indexed taker,
        address assetId,
        uint256 amount,
        bytes32 indexed hashedSecret,
        uint256 expiryTime,
        address feeAsset,
        uint256 feeAmount,
        uint256 nonce,
        uint256 cancelFeeAmount
    );

    constructor() public {
        adminAddresses[msg.sender] = true;
        operator = msg.sender;

        slowWithdrawDelay = MAX_SLOW_WITHDRAW_DELAY;

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
        emit AddAdmin(_admin);
    }

    function removeAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        require(adminAddresses[_admin], "Admin not yet added");
        delete adminAddresses[_admin];
        emit RemoveAdmin(_admin);
    }

    function whitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        require(!tokenWhitelist[_assetId], "Token already whitelisted");
        tokenWhitelist[_assetId] = true;
        emit WhitelistToken(_assetId);
    }

    function unwhitelistToken(address _assetId) external onlyOwner {
        _validateAddress(_assetId);
        require(tokenWhitelist[_assetId], "Token not yet whitelisted");
        delete tokenWhitelist[_assetId];
        emit UnwhitelistToken(_assetId);
    }

    function whitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        require(!spenderWhitelist[_spender], "Spender already added");
        spenderWhitelist[_spender] = true;
        emit AddSpender(_spender);
    }

    function unwhitelistSpender(address _spender) external onlyOwner {
        _validateAddress(_spender);
        require(spenderWhitelist[_spender], "Spender not yet added");
        delete spenderWhitelist[_spender];
        emit RemoveSpender(_spender);
    }

    function authorizeSpender(
        address _user,
        address _spender,
        uint256 _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
        onlyAdmin
    {
        require(spenderWhitelist[_spender], "Invalid spender");
        _markNonce(_nonce);

        _validateSignature(_user, _v, _r, _s,
            keccak256(abi.encode(
                AUTHORIZE_SPENDER_TYPEHASH,
                _user,
                _spender,
                _nonce
            ))
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

        emit SpendFrom(_from, _to, _assetId, _amount);
    }

    function deposit() external payable onlyActiveState {
        require(msg.value > 0, "Invalid value");
        _increaseBalance(msg.sender, ETHER_ADDR, msg.value, REASON_DEPOSIT, 0, 0);
        emit Deposit(msg.sender, msg.value);
    }

    function depositToken(
        address _user,
        address _assetId,
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
        _validateContractAddress(_assetId);

        ERC20Token token = ERC20Token(_assetId);
        uint256 initialBalance = token.balanceOf(address(this));
        uint256 amount = token.allowance(_user, address(this));
        uint256 maxAmount = token.balanceOf(_user);

        // ensure that "amount" does not exceed what the user has
        if (amount > maxAmount) { amount = maxAmount; }
        if (amount == 0) { return; }

        // ERC20Token cannot be used for transferFrom calls because some
        // tokens have a transferFrom which returns a boolean and some do not
        // having two overloaded transferFrom methods does not work
        // as the signatures are the same but the return values are not
        bytes memory payload = abi.encodeWithSignature(
                                   "transferFrom(address,address,uint256)",
                                   _user,
                                   address(this),
                                   amount
                               );
        bytes memory returnData = _callContract(_assetId, payload);
        // ensure that asset transfer succeeded
        _validateTransferResult(returnData);

        uint256 finalBalance = token.balanceOf(address(this));
        uint256 transferredAmount = finalBalance - initialBalance;

        _increaseBalance(
            _user,
            _assetId,
            transferredAmount,
            REASON_DEPOSIT,
            _nonce,
            0
        );

        emit DepositToken(_user, _assetId, transferredAmount, _nonce);
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

    function optrade(
        address[] memory _addresses,
        uint256[] memory _values,
        bytes32[] memory _hashes,
        uint256[] memory _matches,
        uint8[] memory _v,
        uint256 _numMakes
    )
        public
        onlyAdmin
        onlyActiveState
    {
        // 0..(_v.length): nonce lookup table
        // (_v.length)..(_v.length * 2): nonce data
        // (_v.length * 2)..(_v.length * 2 + _numMakes): available offer amounts for makes
        // (_v.length * 2 + _numMakes)..(_v.length * 6 + _numMakes): balance lookup table
        // (_v.length * 6 + _numMakes)..(_v.length * 10 + _numMakes): balance data
        uint256[] memory cache = new uint256[](
                                         _v.length * 2 +
                                         _numMakes +
                                         _v.length * 8
                                     );

        bytes32[] memory hashKeys = new bytes32[](_numMakes);

        assembly {
        // read array value at index
        function read(arr, index) -> item {
            item := mload(add(arr, add(0x20, mul(index, 0x20))))
        }

        // write value to array at index
        function write(arr, index, value) {
            mstore(
                add(arr, add(0x20, mul(index, 0x20))),
                value
            )
        }

        // if the nonce is taken then isTaken will be a non-zero value
        // the non-zero value may not be 1
        function nonceTaken(nonce, index, cacheRef) -> isTaken {
            // isTaken: (1 << (nonce % 256)) & nonceData
            isTaken := and(
                           // 1 << (nonce % 256)
                           shl(mod(nonce, 256), 1),
                           // nonceData: cacheRef[cacheRef[index]]
                           read(
                               cacheRef,
                               read(cacheRef, index)
                           )
                      )
        }

        function markNonce(nonce, index, cacheRef) {
            // set cacheRef[cacheRef[index]]: (1 << (nonce % 256)) | cacheRef[cacheRef[index]]
            write(
                cacheRef,
                read(cacheRef, index),
                or(
                    // 1 << (nonce % 256)
                    shl(mod(nonce, 256), 1),
                    read(cacheRef, index)
                )
            )
        }

        // return a + b
        function safeAdd(a, b) -> c {
            c := add(a, b)
            // revert if c < a
            if lt(c, a) { revert(0, 0) }
        }

        // return a - b
        function safeSub(a, b) -> c {
            // revert if b > a
            if gt(b, a) { revert(0, 0) }
            c := sub(a, b)
        }

        // return a * b
        function safeMul(a, b) -> c {
            c := mul(a, b)
            // revert if c / a != b
            if iszero(eq(div(c, a), b)) { revert(0, 0) }
        }

        // return a / b
        function safeDiv(a, b) -> c {
            // revert if b == 0
            if eq(b, 0) { revert(0, 0) }
            c := div(a, b)
        }

        // VALIDATE INPUT LENGTHS
        // there must be at least one make so
        // revert if _numMakes == 0,
        if eq(_numMakes, 0) { revert(0, 0) }
        // revert if !(_numMakes < _v.length)
        if iszero(lt(_numMakes, mload(_v))) { revert(0, 0) }

        // check that number of signatures matches number of make and fill addresses
        // revert if _v.length * 4 != _addresses.length
        if iszero(eq(mul(mload(_v), 4), mload(_addresses))) { revert(0, 0) }
        // check that number of signatures matches number of make and fill values
        // revert if _v.length * 4 != _values.length
        if iszero(eq(mul(mload(_v), 4), mload(_values))) { revert(0, 0) }
        // check that number of signatures matches number of r, s values
        // revert if _v.length * 2 != _hashes.length
        if iszero(eq(mul(mload(_v), 2), mload(_hashes))) { revert(0, 0) }

        // VALIDATE NONCE UNIQUENESS,
        // CACHE NONCE DATA
        {
            let nonceA
            let nonceB
            let memptr := mload(0x40)
            // "usedNonces" is the 6th declared contract variable
            mstore(add(memptr, 0x20), 6)

            for { let i := 0 } lt(i, mload(_v)) { i := add(i, 1) } {
                // nonce: _values[i * 4 + 3]
                nonceA := read(_values, add(mul(i, 4), 3))

                if iszero(read(cache, i)) {
                    mstore(memptr, div(nonceA, 256))
                    // set cache[i]: _v.length + i
                    write(cache, i, add(mload(_v), i))
                    // set cache[_v.length + i]: nonce data
                    write(
                        cache,
                        add(mload(_v), i),
                        sload(keccak256(memptr, 0x40))
                    )
                }

                for { let j := add(i, 1) } lt(j, mload(_v)) { j := add(j, 1) } {
                    // nonce: _values[j * 4 + 3]
                    nonceB := read(_values, add(mul(j, 4), 3))
                    if eq(nonceA, nonceB) { revert(0, 0) }
                    if eq(div(nonceA, 256), div(nonceB, 256)) {
                        // set cache[j]: _v.length + i
                        write(cache, j, add(mload(_v), i))
                    }
                }
            }
        }

        // VALIDATE MATCHES
        for { let i := 0 } lt(i, mload(_matches)) { i := add(i, 3) } {
            // makeIndex: _matches[i]
            let makeIndex := read(_matches, i)
             // fillIndex: _matches[i + 1]
            let fillIndex := read(_matches, add(i, 1))

            // revert if make.offerAssetId != fill.wantAssetId
            if iszero(
                eq(
                    // make.offerAssetId: _addresses[makeIndex * 4 + 1]
                    read(_addresses, add(mul(makeIndex, 4), 1)),
                    // fill.wantAssetId: _addresses[fillIndex * 4 + 2]
                    read(_addresses, add(mul(fillIndex, 4), 2))
                )
            ) { revert(0, 0) }

            // revert if make.wantAssetId != fill.offerAssetId
            if iszero(
                eq(
                    // make.wantAssetId: _addresses[makeIndex + 2]
                    read(_addresses, add(mul(makeIndex, 4), 2)),
                    // fill.offerAssetId: _addresses[fillIndex + 1]
                    read(_addresses, add(mul(fillIndex, 4), 1))
                )
            ) { revert(0, 0) }

            // revert if (make.wantAmount * takeAmount) % make.offerAmount != 0
            if eq(
                iszero(
                    mod(
                        mul(
                            // make.wantAmount: _values[makeIndex * 4 + 1]
                            read(_values, add(mul(makeIndex, 4), 1)),
                            // takeAmount: _matches[i + 2]
                            read(_matches, add(i, 2))
                        ),
                        // make.offerAmount: _values[makeIndex * 4]
                        read(_values, mul(makeIndex, 4))
                    )
                ),
                0
            ) { revert(0, 0) }
        }

        // VALIDATE MAKE SIGNATURES,
        // READ AVAILABLE OFFER AMOUNTS,
        // MARK MAKE NONCES AS USED
        {
            let hashKey
            let existingMake
            let memptr := mload(0x40)
            for { let i := 0 } lt(i, _numMakes) { i := add(i, 1) } {
                // OFFER_TYPEHASH
                mstore(memptr, 0xf845c83a8f7964bc8dd1a092d28b83573b35be97630a5b8a3b8ae2ae79cd9260)
                // maker: _addresses[i * 4]
                mstore(
                    add(memptr, 0x20), // 32
                    read(_addresses, mul(i, 4))
                )
                // make.offerAssetId: _addresses[i * 4 + 1]
                mstore(
                    add(memptr, 0x40), // 64
                    read(_addresses, add(mul(i, 4), 1))
                )
                // make.offerAmount: _values[i * 4]
                mstore(
                    add(memptr, 0x60), // 96
                    read(_values, mul(i, 4))
                )
                // make.wantAssetId: _addresses[i * 4 + 2]
                mstore(
                    add(memptr, 0x80), // 128
                    read(_addresses, add(mul(i, 4), 2))
                )
                // make.wantAmount: _values[i * 4 + 1]
                mstore(
                    add(memptr, 0xA0),
                    read(_values, add(mul(i, 4), 1))
                )
                // make.feeAssetId: _addresses[i * 4 + 3]
                mstore(
                    add(memptr, 0xC0),
                    read(_addresses, add(mul(i, 4), 3))
                )
                // make.feeAmount: _values[i * 4 + 2]
                mstore(
                    add(memptr, 0xE0),
                    read(_values, add(mul(i, 4), 2))
                )
                // make.nonce: _values[i * 4 + 3]
                mstore(
                    add(memptr, 0x100),
                    read(_values, add(mul(i, 4), 3))
                )

                hashKey := keccak256(memptr, 0x120)

                // store \x19\x01 prefix
                mstore(add(memptr, 0x120), 0x0000000000000000000000000000000000000000000000000000000000001901)
                // store DOMAIN_SEPARATOR
                mstore(add(memptr, 0x140), 0x14f697e312cdba1c10a1eb5c87d96fa22b63aef9dc39592568387471319ea630)
                // store hashKey
                mstore(add(memptr, 0x160), hashKey)

                // calculate signHash for make, the values are 0x13E and 0x42
                // as arguments are tightly packed for signHash
                mstore(add(memptr, 0x180), keccak256(add(memptr, 0x13E), 0x42))
                // v: _v[i]
                mstore(add(memptr, 0x1A0), read(_v, i))
                // r: _hashes[i * 2]
                mstore(add(memptr, 0x1C0), read(_hashes, mul(i, 2)))
                // s: _hashes[i * 2 + 1]
                mstore(add(memptr, 0x1E0), read(_hashes, add(mul(i, 2), 1)))

                // call(3000 gas limit, ecrecover at address 1, input start, input size, output start, output size)
                // revert if call returns 0
                if iszero(call(3000, 1, 0, add(memptr, 0x180), 0x80, add(memptr, 0x200), 0x20)) {
                    revert(0, 0)
                }

                // revert if the returned address from ecrecover does not match the maker's address at _addresses[i * 4]
                if iszero(eq(
                       mload(add(memptr, 0x200)),
                       read(_addresses, mul(i, 4))
                   )) { revert(0, 0) }

                // set hashKeys[i]: hashKey
                write(hashKeys, i, hashKey)

                existingMake := nonceTaken(
                                    // make.nonce: _values[i * 4 + 3]
                                    read(_values, add(mul(i, 4), 3)),
                                    i,
                                    cache
                                )

                // if this is an existing make then
                // read the available offer amount from offers
                if existingMake {
                    // "offers" is the 5th declared contract variable
                    mstore(add(memptr, 0x220), hashKey)
                    mstore(add(memptr, 0x240), 5)

                    // cache[_v.length * 2 + i]: offers[hashKey]
                    write(
                        cache,
                        add(mul(mload(_v), 2), i),
                        // keccak256(hashKey, 5)
                        sload(keccak256(add(memptr, 0x220), 0x40))
                    )
                }

                // if this is not an existing make then
                // set the available offer amount as the make.offerAmount
                if iszero(existingMake) {
                    // cache[_v.length * 2 + i]: make.offerAmount
                    write(
                        cache,
                        add(mul(mload(_v), 2), i),
                        // make.offerAmount: _values[i * 4]
                        read(_values, mul(i, 4))
                    )
                }

                markNonce(
                    // make.nonce: _values[i * 4 + 3]
                    read(_values, add(mul(i, 4), 3)),
                    i,
                    cache
                )
            }
        }

        // VALIDATE THAT ALL FILL NONCES ARE UNUSED,
        // MARK ALL FILL NONCES AS USED
        for { let i := _numMakes } lt(i, mload(_v)) { i := add(i, 1) } {
            // fill.nonce: _values[i * 4 + 3]
            let fillNonce := read(_values, add(mul(i, 4), 3))

            if nonceTaken(
                   fillNonce,
                   i,
                   cache
               ) { revert(0, 0) }

            markNonce(
                fillNonce,
                i,
                cache
            )
        }

        // STORE USED NONCES
        {
            let slotIndex
            let memptr := mload(0x40)
            mstore(add(memptr, 0x20), 6)
            for { let i := 0 } lt(i, mload(_v)) { i := add(i, 1) } {
                slotIndex := mload(add(
                                 cache,
                                 add(0x20, mul(i, 0x20))
                             ))

                // only update storage if slotIndex == _v.length + i
                // so that unnecessary storage updates will be avoided
                if eq(slotIndex, add(mload(_v), i)) {
                    // store nonce / 256
                    mstore(memptr, div(
                                       // nonce: _values[i * 4 + 3]
                                       read(_values, add(mul(i, 4), 3)),
                                       256
                                   )
                          )

                    // set usedNonces[nonce / 256]: cache[_v.length + i]
                    sstore(
                        // keccak256(nonce / 256, 6)
                        keccak256(memptr, 0x40),
                        read(cache, add(mload(_v), i))
                    )
                }
            }
        }

        // PROCESS FILLS
        {
            for { let i := _numMakes } lt(i, mload(_v)) { i := add(i, 1) } {
                // fill.offerAmount: _values[i * 4]
                // fill.wantAmount: _values[i * 4 + 1]
                for { let j := 0 } lt(j, mload(_matches)) { j := add(j, 3) } {
                    // only process if _matches[j + 1] == i
                    // _matches[j + 1]: fillIndex
                    if eq(read(_matches, add(j, 1)), i) {
                        // remainingWantAmount -= takeAmount
                        // fill.wantAmount -= takeAmount
                        write(
                            _values,
                            // fill.wantAmount: _values[i * 4 + 1]
                            add(mul(i, 4), 1),
                            safeSub(
                                read(_values, add(mul(i, 4), 1)),
                                // takeAmount: _matches[j + 2]
                                read(_matches, add(j, 2))
                            )
                        )

                        // giveAmount: make.wantAmount * takeAmount / make.offerAmount
                        let giveAmount := safeDiv(
                                          safeMul(
                                              // make.wantAmount: _values[_matches[j] * 4 + 1]
                                              read(
                                                  _values,
                                                  add(mul(read(_matches, j), 4), 1)
                                              ),
                                              // takeAmount: _matches[j + 2]
                                              read(_matches, add(j, 2))
                                          ),
                                          // make.offerAmount: _values[_matches[j] * 4]
                                          read(
                                              _values,
                                              mul(read(_matches, j), 4)
                                          )
                                      )


                        // fill.offerAmount -= giveAmount
                        write(
                            _values,
                            // fill.offerAmount: _values[i * 4]
                            mul(i, 4),
                            safeSub(
                                read(_values, mul(i, 4)),
                                giveAmount
                            )
                        )
                    }
                }

                // fill must be completely filled
                // revert if the remaining fill.offerAmount != 0
                if read(_values, mul(i, 4)) { revert(0, 0) }
                // revert if the remaining fill.wantAmount != 0
                if read(_values, add(mul(i, 4), 1)) { revert(0, 0) }
            }
        }

        } // end assembly
    }

    event DebugLog(uint256 v1, uint256 v2);
    function test(uint256[] memory _matches) public {
        uint256 v1;
        uint256 v2;
        usedNonces[20] = 100;

        assembly {
            let memptr := mload(0x40)

            // read usedNonces[20]
            mstore(memptr, 20)
            // "usedNonces" is the 6th declared contract variable
            mstore(add(memptr, 0x20), 6)

            let key := keccak256(memptr, 0x40)
            v1 := sload(key)
        }
        emit DebugLog(v1, v2);
    }

    // _addresses =>
    //     [i * 4]: maker
    //     [i * 4 + 1]: make.offerAssetId
    //     [i * 4 + 2]: make.wantAssetId
    //     [i * 4 + 3]: make.feeAssetId
    //     [j * 4]: filler
    //     [j * 4 + 1]: fill.offerAssetId
    //     [j * 4 + 2]: fill.wantAssetId
    //     [j * 4 + 3]: fill.feeAssetId
    // _values =>
    //     [i * 4]: make.offerAmount
    //     [i * 4 + 1]: make.wantAmount
    //     [i * 4 + 2]: make.feeAmount
    //     [i * 4 + 3]: make.nonce
    //     [j * 4]: fill.offerAmount
    //     [j * 4 + 1]: fill.wantAmount
    //     [j * 4 + 2]: fill.feeAmount
    //     [j * 4 + 3]: fill.nonce
    // _hashes =>
    //     [i * 2]: make.r
    //     [i * 2 + 1]: make.s
    //     [j * 2]: fill.r
    //     [j * 2 + 1]: fill.s
    // _matches =>
    //     [0]: index of first fill
    //     [i * 3 + 1]: fillIndex
    //     [i * 3 + 2]: makeIndex
    //     [i * 3 + 3]: fill.takeAmount
    // _v =>
    //     [i]: make.v
    //     [j]: fill.v
    function trade(
        address[] memory _addresses,
        uint256[] memory _values,
        bytes32[] memory _hashes,
        uint256[] memory _matches,
        uint8[] memory _v
    )
        public
        onlyAdmin
        onlyActiveState
    {
        require(
            _matches[0] > 0 && _matches[0] <= _v.length,
            "Invalid fill index"
        );
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
        bytes32 _s
    )
        external
        onlyAdmin
        onlyActiveState
    {
        _markNonce(_nonce);

        _validateSignature(_withdrawer, _v, _r, _s,
            keccak256(abi.encode(
                WITHDRAW_TYPEHASH,
                _withdrawer,
                _assetId,
                _amount,
                _feeAssetId,
                _feeAmount,
                _nonce
            ))
        );

        _withdraw(
            _withdrawer,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            _nonce
        );

        emit Withdraw(
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
        emit AdminWithdraw(_withdrawer, _assetId, _amount);
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
        uint8 _v
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
        _validateSignature(_addresses[0], _v, _hashes[1], _hashes[2], swapHash);

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

        emit CreateSwap(
            _addresses[0], // maker
            _addresses[1], // taker
            _addresses[2], // assetId
            _values[0], // amount
            _hashes[0], // hashedSecret
            _values[1], // expiryTime
            _addresses[3], // feeAssetId
            _values[2], // feeAmount
            _values[3] // nonce
        );
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

        emit ExecuteSwap(
            _addresses[0], // maker
            _addresses[1], // taker
            _addresses[2], // assetId
            _values[0], // amount
            _hashedSecret, // hashedSecret
            _values[1], // expiryTime
            _addresses[3], // feeAssetId
            _values[2], // feeAmount
            _values[3], // nonce
            _preimage
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

        emit CancelSwap(
            _addresses[0], // maker
            _addresses[1], // taker
            _addresses[2], // assetId
            _values[0], // amount
            _hashedSecret, // hashedSecret
            _values[1], // expiryTime
            _addresses[3], // feeAssetId
            _values[2], // feeAmount
            _values[3], // nonce
            cancelFeeAmount // cancelFeeAmount
        );
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

        uint256 withdrawAmount = _decreaseBalanceWithFees(
            _withdrawer,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            REASON_WITHDRAW,
            REASON_WITHDRAW_FEE_GIVE,
            REASON_WITHDRAW_FEE_RECEIVE,
            _nonce,
            0
        );

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

    function _validateSignature(
        address _user,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        bytes32 _hash
    )
        private
        pure
    {
        bytes32 eip712Hash = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            _hash
        ));
        require(_user == ecrecover(eip712Hash, _v, _r, _s), "Invalid signature");
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

    // returns remaining amount after fees
    function _decreaseBalanceWithFees(
        address _user,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _reasonCode,
        uint256 _feeGiveReasonCode,
        uint256 _feeReceiveReasonCode,
        uint256 _nonceA,
        uint256 _nonceB
    )
        private
        returns (uint256)
    {
        _decreaseBalance(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonceA,
            _nonceB
        );

        _increaseBalance(
            operator,
            _feeAssetId,
            _feeAmount,
            _feeReceiveReasonCode,
            _nonceA,
            _nonceB
        );

        if (_feeAssetId != _assetId) {
            _decreaseBalance(
                _user,
                _feeAssetId,
                _feeAmount,
                _feeGiveReasonCode,
                _nonceA,
                _nonceB
            );
            return _amount;
        }

        return _amount.sub(_feeAmount);
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
    function _validateTransferResult(bytes memory data) private pure {
        require(
            data.length == 0 ||
            (data.length == 32 && _getUint256FromBytes(data) != 0),
            "Invalid transfer"
        );
    }

    function _getUint256FromBytes(
        bytes memory data
    )
        private
        pure
        returns (uint256)
    {
        uint256 parsed;
        assembly { parsed := mload(add(data, 32)) }
        return parsed;
    }
}
