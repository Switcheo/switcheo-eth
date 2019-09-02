pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";
import "./lib/ownership/Ownable.sol";
import "./lib/utils/ReentrancyGuard.sol";
import "./BrokerUtils.sol";

interface IERC1820Registry {
    function setInterfaceImplementer(address account, bytes32 interfaceHash, address implementer) external;
}

interface TokenList {
    function validateToken(address assetId) external view;
}

interface SpenderList {
    function validateSpender(address spender) external view;
    function validateSpenderAuthorization(address user, address spender) external view;
}

/// @title The BrokerV2 contract for Switcheo Exchange
/// @author Switcheo Network
/// @notice This contract faciliates Ethereum and Ethereum token trades
/// between users.
/// Users can trade with each other by making and taking offers without
/// giving up custody of their tokens.
/// Users should first deposit tokens, then communicate off-chain
/// with the exchange coordinator, in order to place orders.
/// This allows trades to be confirmed immediately by the coordinator,
/// and settled on-chain through this contract at a later time.
///
/// @dev Bit compacting is used in the contract to reduce gas costs, when
/// it is used, params are documented as bits(n..m).
/// This means that the documented value is represented by bits starting
/// from and including `n`, up to and excluding `m`.
/// For example, bits(8..16), indicates that the value is represented by bits:
/// [8, 9, 10, 11, 12, 13, 14, 15].
///
/// Bit manipulation of the form (data & ~(~uint(0) << m)) >> n is frequently
/// used to recover the value at the specified bits.
/// For example, to recover bits(2..7) from a uint8 value, we can use
/// (data & ~(~uint8(0) << 7)) >> 2.
/// Given a `data` value of `1101,0111`, bits(2..7) should give "10101".
/// ~uint8(0): "1111,1111" (8 ones)
/// (~uint8(0) << 7): "1000,0000" (1 followed by 7 zeros)
/// ~(~uint8(0) << 7): "0111,1111" (0 followed by 7 ones)
/// (data & ~(~uint8(0) << 7)): "0101,0111" (bits after the 7th bit is zeroed)
/// (data & ~(~uint8(0) << 7)) >> 2: "0001,0101" (matching the expected "10101")
///
/// Additionally, bit manipulation of the form data >> n is used to recover
/// bits(n..e), where e is equal to the number of bits in the data.
/// For example, to recover bits(4..8) from a uint8 value, we can use data >> 4.
/// Given a data value of "1111,1111", bits(4..8) should give "1111".
/// data >> 4: "0000,1111" (matching the expected "1111")
///
/// There is frequent reference and usage of asset IDs, this is a unique
/// identifier used within the contract to represent individual assets.
/// For all tokens, the asset ID is identical to the contract address
/// of the token, this is so that additional mappings are not needed to
/// identify tokens during deposits and withdrawals.
/// The only exception is the Ethereum token, which does not have a contract
/// address, for this reason, the zero address is used to represent the
/// Ethereum token's ID.
contract BrokerV2 is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    struct WithdrawalAnnouncement {
        uint256 amount;
        uint256 withdrawableAt;
    }

    // Exchange states
    enum State { Active, Inactive }
    // Exchange admin states
    enum AdminState { Normal, Escalated }

    // The constants for EIP-712 are precompiled to reduce contract size,
    // the original values are left here for reference and verification.
    // NOTE: CHAIN_ID and VERIFYING_CONTRACT values must be updated before
    // mainnet deployment.
    //
    // bytes32 public constant CONTRACT_NAME = keccak256("Switcheo Exchange");
    // bytes32 public constant CONTRACT_VERSION = keccak256("2");
    // uint256 public constant CHAIN_ID = 3; // TODO: update this before deployment
    // address public constant VERIFYING_CONTRACT = address(1); // TODO: pre-calculate and update this before deployment
    // bytes32 public constant SALT = keccak256("switcheo-eth-eip712-salt");
    // bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(
    //     "EIP712Domain(",
    //         "string name,",
    //         "string version,",
    //         "uint256 chainId,",
    //         "address verifyingContract,",
    //         "bytes32 salt",
    //     ")"
    // ));
    // bytes32 public constant EIP712_DOMAIN_TYPEHASH = 0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472;

    // bytes32 public constant DOMAIN_SEPARATOR = keccak256(abi.encode(
    //     EIP712_DOMAIN_TYPEHASH,
    //     CONTRACT_NAME,
    //     CONTRACT_VERSION,
    //     CHAIN_ID,
    //     VERIFYING_CONTRACT,
    //     SALT
    // ));
    bytes32 public constant DOMAIN_SEPARATOR = 0x14f697e312cdba1c10a1eb5c87d96fa22b63aef9dc39592568387471319ea630;

    // bytes32 public constant WITHDRAW_TYPEHASH = keccak256(abi.encodePacked(
    //     "Withdraw(",
    //         "address withdrawer,",
    //         "address receivingAddress,",
    //         "address assetId,",
    //         "uint256 amount,",
    //         "address feeAssetId,",
    //         "uint256 feeAmount,",
    //         "uint256 nonce",
    //     ")"
    // ));
    bytes32 public constant WITHDRAW_TYPEHASH = 0xbe2f4292252fbb88b129dc7717b2f3f74a9afb5b13a2283cac5c056117b002eb;

    // bytes32 public constant OFFER_TYPEHASH = keccak256(abi.encodePacked(
    //     "Offer(",
    //         "address maker,",
    //         "address offerAssetId,",
    //         "uint256 offerAmount,",
    //         "address wantAssetId,",
    //         "uint256 wantAmount,",
    //         "address feeAssetId,",
    //         "uint256 feeAmount,",
    //         "uint256 nonce",
    //     ")"
    // ));
    bytes32 public constant OFFER_TYPEHASH = 0xf845c83a8f7964bc8dd1a092d28b83573b35be97630a5b8a3b8ae2ae79cd9260;

    // bytes32 public constant CANCEL_TYPEHASH = keccak256(abi.encodePacked(
    //     "Cancel(",
    //         "bytes32 offerHash,",
    //         "address feeAssetId,",
    //         "uint256 feeAmount,",
    //     ")"
    // ));
    bytes32 public constant CANCEL_TYPEHASH = 0x46f6d088b1f0ff5a05c3f232c4567f2df96958e05457e6c0e1221dcee7d69c18;

    // bytes32 public constant SWAP_TYPEHASH = keccak256(abi.encodePacked(
    //     "Swap(",
    //         "address maker,",
    //         "address taker,",
    //         "address assetId,",
    //         "uint256 amount,",
    //         "bytes32 hashedSecret,",
    //         "uint256 expiryTime,",
    //         "address feeAssetId,",
    //         "uint256 feeAmount,",
    //         "uint256 nonce",
    //     ")"
    // ));
    bytes32 public constant SWAP_TYPEHASH = 0x6ba9001457a287c210b728198a424a4222098d7fac48f8c5fb5ab10ef907d3ef;

    // Ether token address is set as the constant 0x00
    address private constant ETHER_ADDR = address(0);

    // Reason codes are used by the off-chain coordinator to track balance changes
    uint256 private constant REASON_DEPOSIT = 0x01;

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

    // 7 days * 24 hours * 60 mins * 60 seconds: 604800
    uint256 private constant MAX_SLOW_WITHDRAW_DELAY = 604800;
    uint256 private constant MAX_SLOW_CANCEL_DELAY = 604800;

    State public state;
    AdminState public adminState;
    // All fees will be transferred to the operator address
    address public operator;
    TokenList public tokenList;
    SpenderList public spenderList;

    // The delay in seconds to complete the respective escape hatch (`slowCancel` / `slowWithdraw`).
    // This gives the off-chain service time to update the off-chain state
    // before the state is separately updated by the user.
    uint256 public slowCancelDelay;
    uint256 public slowWithdrawDelay;

    // A mapping of remaining offer amounts: offerHash => availableAmount
    mapping(bytes32 => uint256) public offers;
    // A mapping of used nonces: nonceIndex => nonceData
    // The storing of nonces is used to ensure that transactions signed by
    // the user can only be used once.
    // For space and gas cost efficiency, one nonceData is used to store the
    // state of 256 nonces.
    // This reduces the average cost of storing a new nonce from 20,000 gas
    // to 5000 + 20,000 / 256 = 5078.125 gas
    // See _markNonce and _nonceTaken for more details.
    mapping(uint256 => uint256) public usedNonces;
    // A mapping of user balances: userAddress => assetId => balance
    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => uint256) public totalBalances;
    // A mapping of atomic swap states: swapHash => isSwapActive
    mapping(bytes32 => bool) public atomicSwaps;

    // A record of admin addresses: userAddress => isAdmin
    mapping(address => bool) public adminAddresses;
    address[] public tradeProviders;
    // A mapping of cancellation announcements for the cancel escape hatch: offerHash => cancellableAt
    mapping(bytes32 => uint256) public cancellationAnnouncements;
    // A mapping of withdrawal announcements: userAddress => assetId => announcementData
    mapping(address => mapping(address => WithdrawalAnnouncement)) public withdrawalAnnouncements;

    // Emitted on positive balance state transitions
    event BalanceIncrease(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 indexed reason,
        uint256 nonce
    );

    // Emitted on negative balance state transitions
    event BalanceDecrease(
        address indexed user,
        address indexed assetId,
        uint256 amount,
        uint256 indexed reason,
        uint256 nonce
    );

    // Compacted versions of the `BalanceIncrease` and `BalanceDecrease` events.
    // These are used in the `trade` method, they are compacted to save gas costs.
    event Increment(uint256 data);
    event Decrement(uint256 data);

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

    event AnnounceCancel(
        bytes32 indexed offerHash,
        uint256 cancellableAt
    );

    event SlowCancel(
        bytes32 indexed offerHash,
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

    /// @notice Initializes the Broker contract
    /// @dev The coordinator, operator and owner (through Ownable) is initialized
    /// to be the address of the sender.
    /// The Broker is put into an active state, with maximum exit delays set.
    /// The Broker is also registered as an implementer of ERC777TokensRecipient
    /// through the ERC1820 registry.
    constructor(address _tokenListAddress, address _spenderListAddress) public {
        adminAddresses[msg.sender] = true;
        operator = msg.sender;
        tokenList = TokenList(_tokenListAddress);
        spenderList = SpenderList(_spenderListAddress);

        slowWithdrawDelay = MAX_SLOW_WITHDRAW_DELAY;
        slowCancelDelay = MAX_SLOW_CANCEL_DELAY;
        state = State.Active;

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
        // Error code 1: onlyAdmin, address is not an admin address
        require(adminAddresses[msg.sender], "1");
        _;
    }

    modifier onlyActiveState() {
        // Error code 2: onlyActiveState, state is not 'Active'
        require(state == State.Active, "2");
        _;
    }

    modifier onlyEscalatedAdminState() {
        // Error code 3: onlyEscalatedAdminState, adminState is not 'Escalated'
        require(adminState == AdminState.Escalated, "3");
        _;
    }

    function isAdmin(address _user) external view returns(bool) {
        return adminAddresses[_user];
    }

    /// @notice Sets tbe Broker's state.
    /// @dev The two available states are `Active` and `Inactive`.
    /// The `Active` state allows for regular exchange activity,
    /// while the `Inactive` state prevents the invokation of deposit
    /// and trading functions.
    /// The `Inactive` state is intended as a means to cease contract operation
    /// in the case of an upgrade or in an emergency.
    /// @param _state The state to transition the contract into
    function setState(State _state) external onlyOwner { state = _state; }

    /// @notice Sets the Broker's admin state.
    /// @dev The two available states are `Normal` and `Escalated`.
    /// In the `Normal` admin state, the admin methods `adminCancel` and `adminWithdraw`
    /// are not invokable.
    /// The admin state must be set to `Escalated` by the contract owner for these
    /// methods to become usable.
    /// In an `Escalated` admin state, admin addresses would be able to cancel offers
    /// and withdraw balances to the respective user's wallet on behalf of users.
    /// The escalated state is intended to be used in the case of a contract upgrade or
    /// in an emergency.
    /// It is set separately from the `Inactive` state so that it is possible
    /// to use admin functions without affecting regular operations.
    /// @param _state The admin state to transition the contract into
    function setAdminState(AdminState _state) external onlyOwner { adminState = _state; }

    /// @notice Sets the operator address.
    /// @dev All fees will be transferred to the operator address.
    /// @param _operator The address to set as the operator
    function setOperator(address _operator) external onlyOwner {
        _validateAddress(operator);
        operator = _operator;
    }

    /// @notice Sets the minimum delay between an `announceCancel` call and
    /// when the cancellation can actually be executed through `slowCancel`.
    /// @dev This gives the off-chain service time to update the off-chain state
    /// before the state is separately updated by the user.
    /// This differs from the regular `cancel` operation, which does not involve a delay.
    /// @param _delay The delay in seconds
    function setSlowCancelDelay(uint256 _delay) external onlyOwner {
        // Error code 4: setSlowCancelDelay, slow cancel delay exceeds max allowable delay
        require(_delay <= MAX_SLOW_CANCEL_DELAY, "4");
        slowCancelDelay = _delay;
    }

    /// @notice Sets the delay between an `announceWithdraw` call and
    /// when the withdrawal can actually be executed through `slowWithdraw`.
    /// @dev This gives the off-chain service time to update the off-chain state
    /// before the state is separately updated by the user.
    /// This differs from the regular `withdraw` operation, which does not involve a delay.
    /// @param _delay The delay in seconds
    function setSlowWithdrawDelay(uint256 _delay) external onlyOwner {
        // Error code 5: setSlowWithdrawDelay, slow withdraw delay exceeds max allowable delay
        require(_delay <= MAX_SLOW_WITHDRAW_DELAY, "5");
        slowWithdrawDelay = _delay;
    }

    /// @notice Gives admin permissons to the specified address.
    /// @dev Admin addresses are intended to coordinate the regular operation
    /// of the Broker contract, and to perform special functions such as
    /// `adminCancel` and `adminWithdraw`.
    /// @param _admin The address to give admin permissions to
    function addAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        // Error code 6: addAdmin, address is already an admin address
        require(!adminAddresses[_admin], "6");
        adminAddresses[_admin] = true;
    }

    /// @notice Removes admin permissons for the specified address.
    /// @param _admin The admin address to remove admin permissions from
    function removeAdmin(address _admin) external onlyOwner {
        _validateAddress(_admin);
        // Error code 7: removeAdmin, address is not an admin address
        require(adminAddresses[_admin], "7");
        delete adminAddresses[_admin];
    }

    function addTradeProvider(address _provider) external onlyOwner {
        _validateAddress(_provider);
        tradeProviders.push(_provider);
    }

    function updateTradeProvider(uint256 _index, address _provider) external onlyOwner {
        _validateAddress(_provider);
        require(tradeProviders[_index] != address(0));
        tradeProviders[_index] = _provider;
    }

    function removeTradeProvider(uint256 _index) external onlyOwner {
        require(tradeProviders[_index] != address(0));
        delete tradeProviders[_index];
    }

    /// @notice Performs a balance transfer from one address to another
    /// @dev This method is intended to be invoked by spender contracts.
    /// To invoke this method, a spender contract must have been
    /// previously whitelisted and also authorized by the address from which
    /// funds will be deducted.
    /// Balance events are not emitted by this method, they should be separately
    /// emitted by the spender contract.
    /// @param _from The address to deduct from
    /// @param _to The address to credit
    /// @param _assetId The asset to transfer
    /// @param _amount The amount to transfer
    function spendFrom(
        address _from,
        address _to,
        address _assetId,
        uint256 _amount
    )
        external
    {
        spenderList.validateSpenderAuthorization(_from, msg.sender);

        _validateAddress(_to);

        balances[_from][_assetId] = balances[_from][_assetId].sub(_amount);
        balances[_to][_assetId] = balances[_to][_assetId].add(_amount);
    }

    function markNonce(uint256 _nonce) external {
        spenderList.validateSpender(msg.sender);
        _markNonce(_nonce);
    }

    /// @notice Deposits ETH into the sender's contract balance
    /// @dev This operation is only usable in an `Active` state
    /// to prevent this contract from receiving ETH in the case that its
    /// operation has been terminated.
    function deposit() external payable onlyActiveState {
        // Error code 15: deposit, msg.value is 0
        require(msg.value > 0, "15");
        _increaseBalance(msg.sender, ETHER_ADDR, msg.value, REASON_DEPOSIT, 0);
        totalBalances[ETHER_ADDR] = totalBalances[ETHER_ADDR].add(msg.value);
    }

    function() payable external {}

    /// @notice Deposits ERC20 tokens under the `_user`'s balance
    /// @dev Transfers token into the Broker contract using the
    /// token's `transferFrom` method.
    /// The user must have previously authorized the token transfer
    /// through the token's `approve` method.
    /// This method has separate `_amount` and `_expectedAmount` values
    /// to support unconventional token transfers, e.g. tokens which have a
    /// proportion burnt on transfer.
    /// Whitelisted tokens cannot use this method as it may cause a double
    /// increment for the user's balance. This is because this method does a
    /// call to the token's `transferFrom` method, and some tokens have a
    /// `transferFrom` that later on calls `tokenFallback` or `tokensReceived`.
    /// @param _user The address of the user depositing the tokens
    /// @param _assetId The address of the token contract
    /// @param _amount The value to invoke the token's `transferFrom` with
    /// @param _expectedAmount The final amount expected to be received by this contract
    /// @param _nonce An unused nonce for balance tracking
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
        nonReentrant
    {
        _markNonce(_nonce);

        _increaseBalance(
            _user,
            _assetId,
            _expectedAmount,
            REASON_DEPOSIT,
            _nonce
        );
        totalBalances[_assetId] = totalBalances[_assetId].add(_expectedAmount);

        BrokerUtils.transferTokensIn(
            _user,
            _assetId,
            _amount,
            _expectedAmount
        );
    }

    /// @notice Deposits ERC223 tokens under the `_user`'s balance
    /// @dev ERC223 tokens should invoke this method when tokens are
    /// sent to the Broker contract.
    /// The invokation will fail unless the token has been previously
    /// whitelisted through the `whitelistToken` method.
    /// @param _user The address of the user sending the tokens
    /// @param _amount The amount of tokens transferred to the Broker
    function tokenFallback(
        address _user,
        uint _amount,
        bytes calldata /* _data */
    )
        external
        onlyActiveState
        nonReentrant
    {
        address assetId = msg.sender;
        tokenList.validateToken(assetId);
        _increaseBalance(_user, assetId, _amount, REASON_DEPOSIT, 0);
        totalBalances[assetId] = totalBalances[assetId].add(_amount);
        emit TokenFallback(_user, assetId, _amount);
    }

    /// @notice Deposits ERC777 tokens under the `_user`'s balance
    /// @dev ERC777 tokens should invoke this method when tokens are
    /// sent to the Broker contract.
    /// The invokation will fail unless the token has been previously
    /// whitelisted through the `whitelistToken` method.
    /// @param _user The address of the user sending the tokens
    /// @param _to The address receiving the tokens
    /// @param _amount The amount of tokens transferred to the Broker
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
        nonReentrant
    {
        if (_to != address(this)) { return; }
        address assetId = msg.sender;
        tokenList.validateToken(assetId);
        _increaseBalance(_user, assetId, _amount, REASON_DEPOSIT, 0);
        totalBalances[assetId] = totalBalances[assetId].add(_amount);
        emit TokensReceived(_user, assetId, _amount);
    }

    /// @notice Executes an array of offers and fills
    /// @dev This method accepts an array of "offers" and "fills" together with
    /// an array of "matches" to specify the matching between the "offers" and "fills".
    /// The data is bit compacted for ease of index referencing and to reduce gas costs,
    /// i.e. data representing different types of information is stored within one 256 bit value.
    ///
    /// For efficient balance updates, the `_addresses` array is meant to contain a
    /// unique set of user asset pairs in the form of:
    /// [
    ///     user_1_address,
    ///     asset_1_address,
    ///     user_1_address,
    ///     asset_2_address,
    ///     user_2_address,
    ///     asset_1_address,
    ///     ...
    /// ]
    /// This allows combining multiple balance updates for a user asset pair
    /// into a single update by first calculating the total balance update for
    /// a pair at a specified index, then looping through the sums to perform
    /// the balance update.
    ///
    /// The added benefit is further gas cost reduction because repeated
    /// user asset pairs do not need to be duplicated for the calldata.
    ///
    /// The operator address and operator fee asset ID is enforced to be `address(0)`,
    /// this is because while a slot is needed, the actual operator address should
    /// be read directly from contract storage, and the operator fee asset ID is
    /// identical to the maker's / filler's feeAssetId.
    /// Enforcing this reduces calldata gas costs as zero bits cost less than
    /// non-zero bits.
    ///
    /// A tradeoff of compacting the bits is that there is a lower maximum value
    /// for offer and fill data, however the limits remain generally practical.
    ///
    /// For `offerAmount`, `wantAmount`, `feeAmount` values, the maximum value
    /// is 2^128. For a token with 18 decimals, this allows support for tokens
    /// with a maximum supply of 1000 million billion billion (33 zeros).
    /// In the case where the maximum value needs to be exceeded, a single
    /// offer / fill can be split into multiple offers / fills by the off-chain
    /// service.
    ///
    /// For nonces the maximum value is 2^80, or more than a billion billion (24 zeros).
    ///
    /// Offers and fills both encompass information about how much (offerAmount)
    /// of a specified token (offerAssetId) the user wants to offer and
    /// how much (wantAmount) of another token (wantAssetId) they want
    /// in return.
    ///
    /// Each match specifies how much of the match's `offer.offerAmount` should
    /// be transferred to the filler, in return, the offer's maker receives:
    /// `offer.wantAmount * match.takeAmount / offer.offerAmount` of the
    /// `offer.wantAssetId` from the filler.
    ///
    /// A few restirctions are enforced to ensure fairness and security of trades:
    /// 1. To prevent unfairness due to rounding issues, it is required that:
    /// `offer.wantAmount * match.takeAmount % offer.offerAmount == 0`.
    ///
    /// 2. Fills can be filled by offers which do not individually match
    /// the `fill.offerAmount` and `fill.wantAmount` ratio. As such, it is
    /// required that:
    /// fill.offerAmount == total amount deducted from filler for the fill's
    /// associated matches (excluding fees)
    /// fill.wantAmount == total amount credited to filler for the fill's
    /// associated matches (excluding fees)
    ///
    /// 3. The offer array must not consist of repeated offers. For efficient
    /// balance updates, a loop through each offer in the offer array is used
    /// to deduct the offer.offerAmount from the respective maker.
    /// If an offer has not been recorded by a previos `trade` call,
    /// and it the offer is repeated in the offers array, then there would be
    /// duplicate deductions from the maker.
    /// To enforce uniqueness, it is required that offer nonces are sorted in a
    /// strictly ascending order.
    ///
    /// 4. The fill array must not consist of repeated fills, for the same
    /// reason why there cannot be repeated offers. Additionally, to prevent
    /// replay attacks, all fill nonces are required to be unused.
    ///
    /// @param _values[0] Number of offers, fills, matches, as well as
    /// data about whether an offer's / fill's signature should have the
    /// Ethereum signed message prepended for verification
    /// bits(0..8): number of offers (numOffers)
    /// bits(8..16): number of fills (numFills)
    /// bits(16..24): number of matches (numMatches)
    /// bits(24..256): Whether an offer / fill should have the Ethereum signed
    /// message prepended for signature verification. See
    /// `BrokerUtils._validateTradeSignatures` for more details.
    ///
    /// @param _values[1 + i * 2] First part of offer data for the i'th offer
    /// bits(0..8): Index of the maker's address in _addresses
    /// bits(8..16): Index of the maker offerAssetId pair in _addresses
    /// bits(16..24): Index of the maker wantAssetId pair in _addresses
    /// bits(24..32): Index of the maker feeAssetId pair in _addresses
    /// bits(32..40): Index of the operator feeAssetId pair in _addresses
    /// bits(40..48): The `v` component of the maker's signature for this offer
    /// bits(48..128): The offer nonce to prevent replay attacks
    /// bits(128..256): The number of tokens to be paid to the operator as fees for this offer
    ///
    /// @param _values[2 + i * 2] Second part of offer data for the i'th offer
    /// bits(0..128): offer.offerAmount, i.e. the number of tokens to offer
    /// bits(128..256): offer.wantAmount, i.e. the number of tokens to ask for in return
    ///
    /// @param _values[1 + numOffers * 2 + i * 2] First part of fill data for the i'th fill
    /// bits(0..8): Index of the filler's address in _addresses
    /// bits(8..16): Index of the filler offerAssetId pair in _addresses
    /// bits(16..24): Index of the filler wantAssetId pair in _addresses
    /// bits(24..32): Index of the filler feeAssetId pair in _addresses
    /// bits(32..40): Index of the operator feeAssetId pair in _addresses
    /// bits(40..48): The `v` component of the filler's signature for this fill
    /// bits(48..128): The fill nonce to prevent replay attacks
    /// bits(128..256): The number of tokens to be paid to the operator as fees for this fill
    ///
    /// @param _values[2 + numOffers * 2 + i * 2] Second part of fill data for the i'th fill
    /// bits(0..128): fill.offerAmount, i.e. the number of tokens to offer
    /// bits(128..256): fill.wantAmount, i.e. the number of tokens to ask for in return
    ///
    /// @param _values[1 + numOffers * 2 + numFills * 2 + i] Data for the i'th match
    /// bits(0..8): Index of the offerIndex for this match
    /// bits(8..16): Index of the fillIndex for this match
    /// bits(128..256): The number of tokens to take from the matched offer's offerAmount
    ///
    /// @param _hashes[i * 2] The `r` component of the maker's / filler's signature
    /// for the i'th offer / fill
    ///
    /// @param _hashes[i * 2 + 1] The `s` component of the maker's / filler's signature
    /// for the i'th offer / fill
    ///
    /// @param _addresses An array of user asset pairs in the form of:
    /// [
    ///     user_1_address,
    ///     asset_1_address,
    ///     user_1_address,
    ///     asset_2_address,
    ///     user_2_address,
    ///     asset_1_address,
    ///     ...
    /// ]
    function trade(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses
    )
        external
        onlyAdmin
        onlyActiveState
    {
        // Cache the operator address to reduce gas costs from storage reads
        address operatorAddress = operator;

        // `validateTrades` needs to calculate the hash keys of offers and fills
        // to verify the signature of the offer / fill.
        // The calculated hash keys for each offer is return to reduce repeated
        // computation.
        bytes32[] memory hashKeys = BrokerUtils.validateTrades(
            _values,
            _hashes,
            _addresses
        );

        // Credit fillers for each fill.wantAmount, and credit the operator
        // for each fill.feeAmount.
        _creditFillBalances(_values, _addresses, operatorAddress);

        // Credit makers for each amount received through a matched fill.
        _creditMakerBalances(_values, _addresses);

        // Credit the operator for each offer.feeAmount if the offer has not
        // been recorded through a previous `trade` call.
        _creditMakerFeeBalances(_values, _addresses, operatorAddress);

        // Deduct tokens from fillers for each fill.offerAmount
        // and each fill.feeAmount.
        _deductFillBalances(_values, _addresses);

        // Deduct tokens from makers for each offer.offerAmount
        // and each offer.feeAmount if the offer has not been recorded
        // through a previous `trade` call.
        _deductMakerBalances(_values, _addresses);

        // Reduce available offer amounts of offers and store the remaining
        // offer amount in the `offers` mapping.
        // Offer nonces will also be marked as taken.
        _storeOfferData(_values, hashKeys);

        // Mark all fill nonces as taken in the `usedNonces` mapping.
        _storeFillNonces(_values);
    }

    function networkTrade(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses
    )
        external
        onlyAdmin
        onlyActiveState
        nonReentrant
    {
        // Cache the operator address to reduce gas costs from storage reads
        address operatorAddress = operator;

        // `validateTrades` needs to calculate the hash keys of offers and fills
        // to verify the signature of the offer / fill.
        // The calculated hash keys for each offer is return to reduce repeated
        // computation.
        bytes32[] memory hashKeys = BrokerUtils.validateNetworkTrades(
            _values,
            _hashes,
            _addresses,
            operatorAddress
        );

        _creditMakerBalances(_values, _addresses);
        _creditMakerFeeBalances(_values, _addresses, operatorAddress);
        _deductMakerBalances(_values, _addresses);
        _storeOfferData(_values, hashKeys);

        uint256[] memory increments = BrokerUtils.performNetworkTrades(
            _values,
            _addresses,
            tradeProviders
        );
        _incrementBalances(increments, 0, 0, increments.length - 1, _addresses);
    }

    /// @notice Cancels a perviously made offer and refunds the remaining offer
    /// amount to the offer maker.
    /// To reduce gas costs, the original parameters of the offer are not stored
    /// in the contract's storage, only the hash of the parameters is stored for
    /// verification, so the original parameters need to be re-specified here.
    ///
    /// The `_expectedavailableamount` is required to help prevent accidental
    /// cancellation of an offer ahead of time, for example, if there is
    /// a pending fill in the off-chain state.
    ///
    /// @param _values[0] The offerAmount and wantAmount of the offer
    /// bits(0..128): offer.offerAmount
    /// bits(128..256): offer.wantAmount
    ///
    /// @param _values[1] The fee amounts
    /// bits(0..128): offer.feeAmount
    /// bits(128..256): cancelFeeAmount
    ///
    /// @param _values[2] Additional offer and cancellation data
    /// bits(0..128): expectedAvailableAmount
    /// bits(128..136): prefixedSignature
    /// bits(136..144): The `v` component of the maker's signature for the cancellation
    /// bits(144..256): offer.nonce
    ///
    /// @param _hashes[0] The `r` component of the maker's signature for the cancellation
    /// @param _hashes[1] The `s` component of the maker's signature for the cancellation
    ///
    /// @param _addresses[0] offer.maker
    /// @param _addresses[1] offer.offerAssetId
    /// @param _addresses[2] offer.wantAssetId
    /// @param _addresses[3] offer.feeAssetId
    /// @param _addresses[4] offer.cancelFeeAssetId
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

        _validateSignature(
            cancelHash,
            _addresses[0], // maker
            uint8((_values[2] & ~(~uint256(0) << 144)) >> 136), // v
            _hashes[0], // r
            _hashes[1], // s
            ((_values[2] & ~(~uint256(0) << 136)) >> 128) != 0 // prefixedSignature
        );

        _cancel(
            _addresses[0], // maker
            offerHash,
            _values[2] & ~(~uint256(0) << 128), // expectedAvailableAmount
            _addresses[1], // offerAssetId
            _values[2] >> 144, // offerNonce
            _addresses[4], // cancelFeeAssetId
            _values[1] >> 128 // cancelFeeAmount
        );
    }

    /// @notice Cancels an offer without requiring the maker's signature
    /// @dev This method is intended to be used in the case of a contract
    /// upgrade or in an emergency. It can only be invoked by an admin and only
    /// after the admin state has been set to `Escalated` by the contract owner.
    ///
    /// To reduce gas costs, the original parameters of the offer are not stored
    /// in the contract's storage, only the hash of the parameters is stored for
    /// verification, so the original parameters need to be re-specified here.
    ///
    /// The `_expectedavailableamount` is required to help prevent accidental
    /// cancellation of an offer ahead of time, for example, if there is
    /// a pending fill in the off-chain state.
    /// @param _maker The address of the offer's maker
    /// @param _offerAssetId The contract address of the offerred asset
    /// @param _offerAmount The number of tokens offerred
    /// @param _wantAssetId The contract address of the asset asked in return
    /// @param _wantAmount The number of tokens asked for in return
    /// @param _feeAssetId The contract address of the fee asset
    /// @param _feeAmount The number of tokens to pay as fees to the operator
    /// @param _offerNonce The nonce of the original offer
    /// @param _expectedAvailableAmount The offer amount remaining
    function adminCancel(
        address _maker,
        address _offerAssetId,
        uint256 _offerAmount,
        address _wantAssetId,
        uint256 _wantAmount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _offerNonce,
        uint256 _expectedAvailableAmount
    )
        external
        onlyAdmin
        onlyEscalatedAdminState
    {
        bytes32 offerHash = keccak256(abi.encode(
            OFFER_TYPEHASH,
            _maker,
            _offerAssetId,
            _offerAmount,
            _wantAssetId,
            _wantAmount,
            _feeAssetId,
            _feeAmount,
            _offerNonce
        ));

        _cancel(
            _maker,
            offerHash,
            _expectedAvailableAmount,
            _offerAssetId,
            _offerNonce,
            address(0),
            0
        );
    }

    /// @notice Announces a user's intention to cancel their offer
    /// @dev This method allows a user to cancel their offer without requiring
    /// admin permissions.
    /// An announcement followed by a delay is needed so that the off-chain
    /// service has time to update the off-chain state.
    ///
    /// To reduce gas costs, the original parameters of the offer are not stored
    /// in the contract's storage, only the hash of the parameters is stored for
    /// verification, so the original parameters need to be re-specified here.
    ///
    /// @param _maker The address of the offer's maker
    /// @param _offerAssetId The contract address of the offerred asset
    /// @param _offerAmount The number of tokens offerred
    /// @param _wantAssetId The contract address of the asset asked in return
    /// @param _wantAmount The number of tokens asked for in return
    /// @param _feeAssetId The contract address of the fee asset
    /// @param _feeAmount The number of tokens to pay as fees to the operator
    /// @param _offerNonce The nonce of the original offer
    function announceCancel(
        address _maker,
        address _offerAssetId,
        uint256 _offerAmount,
        address _wantAssetId,
        uint256 _wantAmount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _offerNonce
    )
        external
    {
        // Error code 19: announceCancel, invalid msg.sender
        require(_maker == msg.sender, "19");

        bytes32 offerHash = keccak256(abi.encode(
            OFFER_TYPEHASH,
            _maker,
            _offerAssetId,
            _offerAmount,
            _wantAssetId,
            _wantAmount,
            _feeAssetId,
            _feeAmount,
            _offerNonce
        ));

        // Error code 20: announceCancel, nothing left to cancel
        require(offers[offerHash] > 0, "20");

        uint256 cancellableAt = now.add(slowCancelDelay);
        cancellationAnnouncements[offerHash] = cancellableAt;

        emit AnnounceCancel(offerHash, cancellableAt);
    }

    /// @notice Executes an offer cancellation previously announced in `announceCancel`
    /// @dev This method allows a user to cancel their offer without requiring
    /// admin permissions.
    /// An announcement followed by a delay is needed so that the off-chain
    /// service has time to update the off-chain state.
    ///
    /// To reduce gas costs, the original parameters of the offer are not stored
    /// in the contract's storage, only the hash of the parameters is stored for
    /// verification, so the original parameters need to be re-specified here.
    ///
    /// @param _maker The address of the offer's maker
    /// @param _offerAssetId The contract address of the offerred asset
    /// @param _offerAmount The number of tokens offerred
    /// @param _wantAssetId The contract address of the asset asked in return
    /// @param _wantAmount The number of tokens asked for in return
    /// @param _feeAssetId The contract address of the fee asset
    /// @param _feeAmount The number of tokens to pay as fees to the operator
    /// @param _offerNonce The nonce of the original offer
    function slowCancel(
        address _maker,
        address _offerAssetId,
        uint256 _offerAmount,
        address _wantAssetId,
        uint256 _wantAmount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _offerNonce
    )
        external
    {
        bytes32 offerHash = keccak256(abi.encode(
            OFFER_TYPEHASH,
            _maker,
            _offerAssetId,
            _offerAmount,
            _wantAssetId,
            _wantAmount,
            _feeAssetId,
            _feeAmount,
            _offerNonce
        ));

        uint256 cancellableAt = cancellationAnnouncements[offerHash];
        // Error code 21: slowCancel, cancellation was not announced
        require(cancellableAt != 0, "21");
        // Error code 22: slowCancel, cancellation delay not yet reached
        require(now >= cancellableAt, "22");

        uint256 availableAmount = offers[offerHash];
        // Error code 23: slowCancel, nothing left to cancel
        require(availableAmount > 0, "23");

        delete cancellationAnnouncements[offerHash];
        _cancel(
            _maker,
            offerHash,
            availableAmount,
            _offerAssetId,
            _offerNonce,
            address(0),
            0
        );

        emit SlowCancel(offerHash, availableAmount);
    }

    /// @notice Withdraws tokens from the Broker contract to a user's wallet balance
    /// @dev The user's internal balance is decreased, and the tokens are transferred
    /// to the `_receivingAddress` signed by the user.
    /// @param _withdrawer The user address whose balance will be reduced
    /// @param _receivingAddress The address to tranfer the tokens to
    /// @param _assetId The contract address of the token to withdraw
    /// @param _amount The number of tokens to withdraw
    /// @param _feeAssetId The contract address of the fee asset
    /// @param _feeAmount The number of tokens to pay as fees to the operator
    /// @param _nonce An unused nonce to prevent replay attacks
    /// @param _v The `v` component of the `_user`'s signature
    /// @param _r The `r` component of the `_user`'s signature
    /// @param _s The `s` component of the `_user`'s signature
    /// @param _prefixedSignature Indicates whether the Ethereum signed message
    /// prefix should be prepended during signature verification
    function withdraw(
        address _withdrawer,
        address payable _receivingAddress,
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
                _receivingAddress,
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
            _receivingAddress,
            _assetId,
            _amount,
            _feeAssetId,
            _feeAmount,
            _nonce
        );
    }
    /// @notice Withdraws tokens without requiring the withdrawer's signature
    /// @dev This method is intended to be used in the case of a contract
    /// upgrade or in an emergency. It can only be invoked by an admin and only
    /// after the admin state has been set to `Escalated` by the contract owner.
    /// Unlike `withdraw`, tokens can only be withdrawn to the `_withdrawer`'s
    /// address.
    /// @param _withdrawer The user address whose balance will be reduced
    /// @param _assetId The contract address of the token to withdraw
    /// @param _amount The number of tokens to withdraw
    /// @param _nonce An unused nonce for balance tracking
    function adminWithdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount,
        uint256 _nonce
    )
        external
        onlyAdmin
        onlyEscalatedAdminState
    {
        _markNonce(_nonce);

        _withdraw(
            _withdrawer,
            _withdrawer,
            _assetId,
            _amount,
            address(0),
            0,
            _nonce
        );
    }

    /// @notice Announces a user's intention to withdraw their funds
    /// @dev This method allows a user to withdraw their funds without requiring
    /// admin permissions.
    /// An announcement followed by a delay before execution is needed so that
    /// the off-chain service has time to update the off-chain state.
    /// @param _assetId The contract address of the token to withdraw
    /// @param _amount The number of tokens to withdraw
    function announceWithdraw(
        address _assetId,
        uint256 _amount
    )
        external
    {

        // Error code 24: announceWithdraw, invalid withdrawal amount
        require(_amount > 0 && _amount <= balances[msg.sender][_assetId], "24");

        WithdrawalAnnouncement storage announcement = withdrawalAnnouncements[msg.sender][_assetId];

        announcement.withdrawableAt = now.add(slowWithdrawDelay);
        announcement.amount = _amount;

        emit AnnounceWithdraw(msg.sender, _assetId, _amount, announcement.withdrawableAt);
    }

    /// @notice Executes a withdrawal previously announced in `announceWithdraw`
    /// @dev This method allows a user to withdraw their funds without requiring
    /// admin permissions.
    /// An announcement followed by a delay before execution is needed so that
    /// the off-chain service has time to update the off-chain state.
    /// @param _withdrawer The user address whose balance will be reduced
    /// @param _assetId The contract address of the token to withdraw
    function slowWithdraw(
        address payable _withdrawer,
        address _assetId,
        uint256 _amount
    )
        external
    {
        WithdrawalAnnouncement memory announcement = withdrawalAnnouncements[_withdrawer][_assetId];

        // Error code 25: slowWithdraw, withdrawal was not announced
        require(announcement.withdrawableAt != 0, "25");
        // Error code 26: slowWithdraw, withdrawal delay not yet reached
        require(now >= announcement.withdrawableAt, "26");
        // Error code 27: slowWithdraw, withdrawal amount does not match announced amount
        require(announcement.amount == _amount, "27");

        delete withdrawalAnnouncements[_withdrawer][_assetId];
        _withdraw(
            _withdrawer,
            _withdrawer,
            _assetId,
            announcement.amount,
            address(0),
            0,
            0
        );
        emit SlowWithdraw(_withdrawer, _assetId, announcement.amount);
    }

    /// @notice Locks a user's balances for the first part of an atomic swap
    /// @param _addresses[0] maker: the address of the user to deduct the swap tokens from
    /// @param _addresses[1] taker: the address of the swap taker who will receive the swap tokens
    /// if the swap is completed through `executeSwap`
    /// @param _addresses[2] assetId: the contract address of the token to swap
    /// @param _addresses[3] feeAssetId: the contract address of the token to use as fees
    /// @param _values[0] amount: the number of tokens to lock and to transfer if the swap
    ///  is completed through `executeSwap`
    /// @param _values[1] expiryTime: the time in epoch seconds after which the swap will become cancellable
    /// @param _values[2] feeAmount: the number of tokens to be paid to the operator as fees
    /// @param _values[3] nonce: an unused nonce to prevent replay attacks
    /// @param _hashes[0] hashedSecret: the hash of the secret decided by the maker
    /// @param _hashes[1] The `r` component of the user's signature
    /// @param _hashes[2] The `s` component of the user's signature
    /// @param _v The `v` component of the user's signature
    /// @param _prefixedSignature Indicates whether the Ethereum signed message
    /// prefix should be prepended during signature verification
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
        // Error code 28: createSwap, invalid swap amount
        require(_values[0] > 0, "28");
        // Error code 29: createSwap, expiry time has already passed
        require(_values[1] > now, "29");
        _validateAddress(_addresses[1]);

        bytes32 swapHash = _hashSwap(_addresses, _values, _hashes[0]);
        // Error code 30: createSwap, the swap is already active
        require(!atomicSwaps[swapHash], "30");

        _markNonce(_values[3]);

        _validateSignature(
            swapHash,
            _addresses[0], // swap.maker
            _v,
            _hashes[1], // r
            _hashes[2], // s
            _prefixedSignature
        );

        if (_addresses[3] == _addresses[2]) { // feeAssetId == assetId
            // Error code 31: createSwap, swap.feeAmount exceeds swap.amount
            require(_values[2] < _values[0], "31"); // feeAmount < amount
        } else {
            _decreaseBalance(
                _addresses[0], // maker
                _addresses[3], // feeAssetId
                _values[2], // feeAmount
                REASON_SWAP_FEE_GIVE,
                _values[3] // nonce
            );
        }

        _decreaseBalance(
            _addresses[0], // maker
            _addresses[2], // assetId
            _values[0], // amount
            REASON_SWAP_GIVE,
            _values[3] // nonce
        );

        atomicSwaps[swapHash] = true;
    }

    /// @notice Executes a swap by transferring the tokens previously locked through
    /// a `createSwap` call to the swap taker.
    ///
    /// @dev To reduce gas costs, the original parameters of the swap are not stored
    /// in the contract's storage, only the hash of the parameters is stored for
    /// verification, so the original parameters need to be re-specified here.
    ///
    /// @param _addresses[0] maker: the address of the user to deduct the swap tokens from
    /// @param _addresses[1] taker: the address of the swap taker who will receive the swap tokens
    /// @param _addresses[2] assetId: the contract address of the token to swap
    /// @param _addresses[3] feeAssetId: the contract address of the token to use as fees
    /// @param _values[0] amount: the number of tokens previously locked
    /// @param _values[1] expiryTime: the time in epoch seconds after which the swap will become cancellable
    /// @param _values[2] feeAmount: the number of tokens to be paid to the operator as fees
    /// @param _values[3] nonce: an unused nonce to prevent replay attacks
    /// @param _hashedSecret The hash of the secret decided by the maker
    /// @param _preimage The preimage of the `_hashedSecret`
    function executeSwap(
        address[4] calldata _addresses,
        uint256[4] calldata _values,
        bytes32 _hashedSecret,
        bytes calldata _preimage
    )
        external
    {
        bytes32 swapHash = _hashSwap(_addresses, _values, _hashedSecret);
        // Error code 32: executeSwap, swap is not active
        require(atomicSwaps[swapHash], "32");
        // Error code 32: executeSwap, hash of preimage does not match hashedSecret
        require(sha256(abi.encodePacked(sha256(_preimage))) == _hashedSecret, "33");

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
            _values[3] // nonce
        );

        _increaseBalance(
            operator,
            _addresses[3], // feeAssetId
            _values[2], // feeAmount
            REASON_SWAP_FEE_RECEIVE,
            _values[3] // nonce
        );
    }

    /// @notice Cancels a swap and refunds the previously locked tokens to
    /// the swap maker.
    ///
    /// @dev To reduce gas costs, the original parameters of the swap are not stored
    /// in the contract's storage, only the hash of the parameters is stored for
    /// verification, so the original parameters need to be re-specified here.
    ///
    /// @param _addresses[0] maker: the address of the user to deduct the swap tokens from
    /// @param _addresses[1] taker: the address of the swap taker who will receive the swap tokens
    /// @param _addresses[2] assetId: the contract address of the token to swap
    /// @param _addresses[3] feeAssetId: the contract address of the token to use as fees
    /// @param _values[0] amount: the number of tokens previously locked
    /// @param _values[1] expiryTime: the time in epoch seconds after which the swap will become cancellable
    /// @param _values[2] feeAmount: the number of tokens to be paid to the operator as fees
    /// @param _values[3] nonce: an unused nonce to prevent replay attacks
    /// @param _hashedSecret The hash of the secret decided by the maker
    /// @param _cancelFeeAmount The number of tokens to be paid to the operator as the cancellation fee
    function cancelSwap(
        address[4] calldata _addresses,
        uint256[4] calldata _values,
        bytes32 _hashedSecret,
        uint256 _cancelFeeAmount
    )
        external
    {
        // Error code 34: cancelSwap, expiry time has not been reached
        require(_values[1] <= now, "34");
        bytes32 swapHash = _hashSwap(_addresses, _values, _hashedSecret);
        // Error code 35: cancelSwap, swap is not active
        require(atomicSwaps[swapHash], "35");

        uint256 cancelFeeAmount = _cancelFeeAmount;
        if (!adminAddresses[msg.sender]) { cancelFeeAmount = _values[2]; }

        // cancelFeeAmount < feeAmount
        // Error code 36: cancelSwap, cancelFeeAmount exceeds swap.feeAmount
        require(cancelFeeAmount <= _values[2], "36");

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
            _values[3] // nonce
        );

        _increaseBalance(
            operator,
            _addresses[3], // feeAssetId
            cancelFeeAmount,
            REASON_SWAP_CANCEL_FEE_RECEIVE,
            _values[3] // nonce
        );

        if (_addresses[3] != _addresses[2]) { // feeAssetId != assetId
            uint256 refundFeeAmount = _values[2].sub(cancelFeeAmount);
            _increaseBalance(
                _addresses[0], // maker
                _addresses[3], // feeAssetId
                refundFeeAmount,
                REASON_SWAP_CANCEL_FEE_REFUND,
                _values[3] // nonce
            );
        }
    }

    function claimExcessBalance(address _assetId) external onlyOwner {
        uint256 externalBalance = BrokerUtils.externalBalance(_assetId);
        uint256 diff = totalBalances[_assetId].sub(externalBalance);
        balances[owner][_assetId] = balances[owner][_assetId].add(diff);
    }

    /// @dev Credit fillers for each fill.wantAmount,and credit the operator
    /// for each fill.feeAmount. See the `trade` method for param details.
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
    /// @param _operator Address of the operator
    function _creditFillBalances(
        uint256[] memory _values,
        address[] memory _addresses,
        address _operator
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
            // let assetIndex be filler.wantAssetIndex
            uint256 assetIndex = (_values[i] & ~(~uint256(0) << 24)) >> 16;
            uint256 wantAmount = _values[i + 1] >> 128;

            // credit fill.wantAmount to filler
            increments[assetIndex] = increments[assetIndex].add(wantAmount);
            if (min > assetIndex) { min = assetIndex; }
            if (max < assetIndex) { max = assetIndex; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            // let assetIndex be filler.feeAssetIndex
            assetIndex = (_values[i] & ~(~uint256(0) << 32)) >> 24;
            uint256 feeAssetIndex = ((_values[i] & ~(~uint256(0) << 40)) >> 32);

            // override the operator slot with the actual operator address
            // and set the operator fee asset ID slot to be the fill's feeAssetId
            _addresses[feeAssetIndex * 2] = _operator;
            _addresses[feeAssetIndex * 2 + 1] = _addresses[assetIndex * 2 + 1];

            // credit fill.feeAmount to operator
            increments[feeAssetIndex] = increments[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        _incrementBalances(increments, 1, min, max, _addresses);
    }

    /// @dev Credit makers for each amount received through a matched fill.
    /// See the `trade` method for param details.
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
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
            // match.offerIndex
            uint256 offerIndex = _values[i] & ~(~uint256(0) << 8);
            // offer.wantAssetIndex
            uint256 wantAssetIndex = (_values[1 + offerIndex * 2] & ~(~uint256(0) << 24)) >> 16;

            // match.takeAmount
            uint256 amount = _values[i] >> 128;
            // receiveAmount = match.takeAmount * offer.wantAmount / offer.offerAmount
            amount = amount.mul(_values[2 + offerIndex * 2] >> 128)
                           .div(_values[2 + offerIndex * 2] & ~(~uint256(0) << 128));

            // credit maker for the amount received from the match
            increments[wantAssetIndex] = increments[wantAssetIndex].add(amount);
            if (min > wantAssetIndex) { min = wantAssetIndex; }
            if (max < wantAssetIndex) { max = wantAssetIndex; }
        }

        _incrementBalances(increments, 1, min, max, _addresses);
    }

    /// @dev Credit the operator for each offer.feeAmount if the offer has not
    /// been recorded through a previous `trade` call.
    /// See the `trade` method for param details.
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
    function _creditMakerFeeBalances(
        uint256[] memory _values,
        address[] memory _addresses,
        address _operator
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

            // let assetIndex be maker.feeAssetIndex
            uint256 assetIndex = (_values[i] & ~(~uint256(0) << 32)) >> 24;
            uint256 feeAssetIndex = (_values[i] & ~(~uint256(0) << 40)) >> 32;

            // override the operator slot with the actual operator address
            // and set the operator fee asset ID slot to be the make's feeAssetId
            _addresses[feeAssetIndex * 2] = _operator;
            _addresses[feeAssetIndex * 2 + 1] = _addresses[assetIndex * 2 + 1];

            // credit make.feeAmount to operator
            increments[feeAssetIndex] = increments[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        _incrementBalances(increments, 1, min, max, _addresses);
    }

    /// @dev Deduct tokens from fillers for each fill.offerAmount
    /// and each fill.feeAmount.
    /// See the `trade` method for param details.
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
    function _deductFillBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory decrements = new uint256[](_addresses.length / 2);

        // 1 + numOffers * 2
        uint256 i = 1 + (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i + numFills * 2
        uint256 end = i + ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        // loop fills
        for(i; i < end; i += 2) {
            uint256 offerAssetIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;
            uint256 offerAmount = _values[i + 1] & ~(~uint256(0) << 128);

            // deduct fill.offerAmount from filler
            decrements[offerAssetIndex] = decrements[offerAssetIndex].add(offerAmount);
            if (min > offerAssetIndex) { min = offerAssetIndex; }
            if (max < offerAssetIndex) { max = offerAssetIndex; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            // deduct fill.feeAmount from filler
            uint256 feeAssetIndex = (_values[i] & ~(~uint256(0) << 32)) >> 24;
            decrements[feeAssetIndex] = decrements[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        _decrementBalances(decrements, min, max, _addresses);
    }

    /// @dev Deduct tokens from makers for each offer.offerAmount
    /// and each offer.feeAmount if the offer has not been recorded
    /// through a previous `trade` call.
    /// See the `trade` method for param details.
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
    function _deductMakerBalances(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
    {
        uint256 min = _addresses.length;
        uint256 max = 0;
        uint256[] memory decrements = new uint256[](_addresses.length / 2);

        uint256 i = 1;
        // i + numOffers * 2
        uint256 end = i + (_values[0] & ~(~uint256(0) << 8)) * 2;

        // loop offers
        for(i; i < end; i += 2) {
            uint256 nonce = (_values[i] & ~(~uint256(0) << 128)) >> 48;
            if (_nonceTaken(nonce)) { continue; }

            uint256 offerAssetIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;
            uint256 offerAmount = _values[i + 1] & ~(~uint256(0) << 128);

            // deduct make.offerAmount from maker
            decrements[offerAssetIndex] = decrements[offerAssetIndex].add(offerAmount);
            if (min > offerAssetIndex) { min = offerAssetIndex; }
            if (max < offerAssetIndex) { max = offerAssetIndex; }

            uint256 feeAmount = _values[i] >> 128;
            if (feeAmount == 0) { continue; }

            // deduct make.feeAmount from maker
            uint256 feeAssetIndex = (_values[i] & ~(~uint256(0) << 32)) >> 24;
            decrements[feeAssetIndex] = decrements[feeAssetIndex].add(feeAmount);
            if (min > feeAssetIndex) { min = feeAssetIndex; }
            if (max < feeAssetIndex) { max = feeAssetIndex; }
        }

        _decrementBalances(decrements, min, max, _addresses);
    }

    /// @dev Reduce available offer amounts of offers and store the remaining
    /// offer amount in the `offers` mapping.
    /// Offer nonces will also be marked as taken.
    /// See the `trade` method for param details.
    /// @param _values Values from `trade`
    /// @param _hashKeys An array of offer hash keys
    function _storeOfferData(
        uint256[] memory _values,
        bytes32[] memory _hashKeys
    )
        private
    {
        // Decrements with size numOffers
        uint256[] memory decrements = new uint256[](_values[0] & ~(~uint256(0) << 8));

        uint256 i = 1;
        // i += numOffers * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        // loop matches
        for (i; i < end; i++) {
            uint256 offerIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 takeAmount = _values[i] >> 128;
            decrements[offerIndex] = decrements[offerIndex].add(takeAmount);
        }

        i = 0;
        end = _values[0] & ~(~uint256(0) << 8); // numOffers

        // loop offers
        for (i; i < end; i++) {
            uint256 nonce = (_values[i * 2 + 1] & ~(~uint256(0) << 128)) >> 48;
            bool existingOffer = _nonceTaken(nonce);
            bytes32 hashKey = _hashKeys[i];

            uint256 availableAmount = existingOffer ? offers[hashKey] : (_values[i * 2 + 2] & ~(~uint256(0) << 128));
            // Error code 37: offer's available amount is zero
            require(availableAmount > 0, "37");

            uint256 remainingAmount = availableAmount.sub(decrements[i]);
            if (remainingAmount > 0) { offers[hashKey] = remainingAmount; }
            if (existingOffer && remainingAmount == 0) { delete offers[hashKey]; }

            if (!existingOffer) { _markNonce(nonce); }
        }
    }

    /// @dev Mark all fill nonces as taken in the `usedNonces` mapping.
    /// This also validates fill uniquness within the set of fills in `_values`,
    /// since fill nonces are marked one at a time with validation that the
    /// nonce to be marked has not been marked before.
    /// See the `trade` method for param details.
    /// @param _values Values from `trade`
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

    /// @dev The actual cancellation logic shared by `cancel`, `adminCancel`,
    /// `slowCancel`.
    /// The remaining offer amount is refunded back to the offer's maker, and
    /// the specified cancellation fee will be deducted from the maker's balances.
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
        // Error code 38: _cancel, there is no offer amount left to cancel
        require(refundAmount > 0, "38");
        // Error code 39: _cancel, the remaining offer amount does not match
        // the expectedAvailableAmount
        require(refundAmount == _expectedAvailableAmount, "39");

        delete offers[_offerHash];

        if (_cancelFeeAssetId == _offerAssetId) {
            refundAmount = refundAmount.sub(_cancelFeeAmount);
        } else {
            _decreaseBalance(
                _maker,
                _cancelFeeAssetId,
                _cancelFeeAmount,
                REASON_CANCEL_FEE_GIVE,
                _offerNonce
            );
        }

        _increaseBalance(
            _maker,
            _offerAssetId,
            refundAmount,
            REASON_CANCEL,
            _offerNonce
        );

        _increaseBalance(
            operator,
            _cancelFeeAssetId,
            _cancelFeeAmount,
            REASON_CANCEL_FEE_RECEIVE,
            _offerNonce // offer nonce
        );
    }

    /// @dev The actual withdrawal logic shared by `withdraw`, `adminWithdraw`,
    /// `slowWithdraw`. The specified amount is deducted from the `_withdrawer`'s
    /// contract balance and transferred to the external `_receivingAddress`,
    /// and the specified withdrawal fee will be deducted from the `_withdrawer`'s
    /// balance.
    function _withdraw(
        address _withdrawer,
        address payable _receivingAddress,
        address _assetId,
        uint256 _amount,
        address _feeAssetId,
        uint256 _feeAmount,
        uint256 _nonce
    )
        private
        nonReentrant
    {
        // Error code 40: _withdraw, invalid withdrawal amount
        require(_amount > 0, "40");

        _validateAddress(_receivingAddress);

        _decreaseBalance(
            _withdrawer,
            _assetId,
            _amount,
            REASON_WITHDRAW,
            _nonce
        );
        totalBalances[_assetId] = totalBalances[_assetId].sub(_amount);

        _increaseBalance(
            operator,
            _feeAssetId,
            _feeAmount,
            REASON_WITHDRAW_FEE_RECEIVE,
            _nonce
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
                _nonce
            );
            withdrawAmount = _amount;
        }

        if (_assetId == ETHER_ADDR) {
            _receivingAddress.transfer(withdrawAmount);
            return;
        }

        BrokerUtils.transferTokensOut(
            _receivingAddress,
            _assetId,
            withdrawAmount
        );
    }

    /// @dev Creates a hash key for a swap using the swap's parameters
    /// @param _addresses[0] Address of the user making the swap
    /// @param _addresses[1] Address of the user taking the swap
    /// @param _addresses[2] Contract address of the asset to swap
    /// @param _addresses[3] Contract address of the fee asset
    /// @param _values[0] The number of tokens to be transferred
    /// @param _values[1] The time in epoch seconds after which the swap will become cancellable
    /// @param _values[2] The number of tokens to pay as fees to the operator
    /// @param _values[3] The swap nonce to prevent replay attacks
    /// @param _hashedSecret The hash of the secret decided by the maker
    /// @return The hash key of the swap
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

    /// @dev Checks if the `_nonce` had been previously taken.
    /// To reduce gas costs, a single `usedNonces` value is used to
    /// store the state of 256 nonces, using the formula:
    /// nonceTaken = "usedNonces[_nonce / 256] bit (_nonce % 256)" != 0
    /// For example:
    /// nonce 0 taken: "usedNonces[0] bit 0" != 0 (0 / 256 = 0, 0 % 256 = 0)
    /// nonce 1 taken: "usedNonces[0] bit 1" != 0 (1 / 256 = 0, 1 % 256 = 1)
    /// nonce 2 taken: "usedNonces[0] bit 2" != 0 (2 / 256 = 0, 2 % 256 = 2)
    /// nonce 255 taken: "usedNonces[0] bit 255" != 0 (255 / 256 = 0, 255 % 256 = 255)
    /// nonce 256 taken: "usedNonces[1] bit 0" != 0 (256 / 256 = 1, 256 % 256 = 0)
    /// nonce 257 taken: "usedNonces[1] bit 1" != 0 (257 / 256 = 1, 257 % 256 = 1)
    /// @param _nonce The nonce to check
    /// @return Whether the nonce has been taken
    function _nonceTaken(uint256 _nonce) private view returns (bool) {
        uint256 slotData = _nonce.div(256);
        uint256 shiftedBit = uint256(1) << _nonce.mod(256);
        uint256 bits = usedNonces[slotData];

        // The check is for "!= 0" instead of "== 1" because the shiftedBit is
        // not at the zero'th position, so it would require an additional
        // shift to compare it with "== 1"
        return bits & shiftedBit != 0;
    }

    /// @dev Sets the corresponding `_nonce` bit to 1.
    /// An error will be raised if the corresponding `_nonce` bit was
    /// previously set to 1.
    /// See `_nonceTaken` for details on calculating the corresponding `_nonce` bit.
    /// @param _nonce The nonce to mark
    function _markNonce(uint256 _nonce) private {
        // Error code 41: _markNonce, nonce cannot be zero
        require(_nonce != 0, "41");

        uint256 slotData = _nonce.div(256);
        uint256 shiftedBit = 1 << _nonce.mod(256);
        uint256 bits = usedNonces[slotData];

        // Error code 42: _markNonce, nonce has already been marked
        require(bits & shiftedBit == 0, "42");

        usedNonces[slotData] = bits | shiftedBit;
    }

    /// @dev Validates that the specified `_hash` was signed by the specified `_user`.
    /// This method supports the EIP712 specification, the older Ethereum
    /// signed message specification is also supported for backwards compatibility.
    /// @param _hash The original hash that was signed by the user
    /// @param _user The user who signed the hash
    /// @param _v The `v` component of the `_user`'s signature
    /// @param _r The `r` component of the `_user`'s signature
    /// @param _s The `s` component of the `_user`'s signature
    /// @param _prefixed If true, the signature will be verified
    /// against the Ethereum signed message specification instead of the
    /// EIP712 specification
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
            // Error code 43: _validateSignature, invalid prefixed signature
            require(_user == ecrecover(prefixedHash, _v, _r, _s), "43");
        } else {
            // Error code 44: _validateSignature, invalid non-prefixed signature
            require(_user == ecrecover(eip712Hash, _v, _r, _s), "44");
        }
    }

    /// @dev A utility method to increase the balance of a user.
    /// A corressponding `BalanceIncrease` event will also be emitted.
    /// @param _user The address to increase balance for
    /// @param _assetId The asset's contract address
    /// @param _amount The number of tokens to increase the balance by
    /// @param _reasonCode The reason code for the `BalanceIncrease` event
    /// @param _nonce The nonce for the `BalanceIncrease` event
    function _increaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode,
        uint256 _nonce
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
            _nonce
        );
    }

    /// @dev A utility method to decrease the balance of a user.
    /// A corressponding `BalanceDecrease` event will also be emitted.
    /// @param _user The address to decrease balance for
    /// @param _assetId The asset's contract address
    /// @param _amount The number of tokens to decrease the balance by
    /// @param _reasonCode The reason code for the `BalanceDecrease` event
    /// @param _nonce The nonce for the `BalanceDecrease` event
    function _decreaseBalance(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _reasonCode,
        uint256 _nonce
    )
        private
    {
        if (_amount == 0) { return; }
        balances[_user][_assetId] = balances[_user][_assetId].sub(_amount);

        emit BalanceDecrease(
            _user,
            _assetId,
            _amount,
            _reasonCode,
            _nonce
        );
    }

    /// @dev Ensures that `_address` is not the zero address
    /// @param _address The address to check
    function _validateAddress(address _address) private pure {
        // Error code 45: _validateAddress, invalid address
        require(_address != address(0), "45");
    }

    function _incrementBalances(
        uint256[] memory increments,
        uint256 _static,
        uint256 _i,
        uint256 _end,
        address[] memory _addresses
    )
        private
    {
        for(_i; _i <= _end; _i++) {
            uint256 increment = increments[_i];
            if (increment == 0) { continue; }

            balances[_addresses[_i * 2]][_addresses[_i * 2 + 1]] =
            balances[_addresses[_i * 2]][_addresses[_i * 2 + 1]].add(increment);

            emit Increment((_i << 248) | (_static << 240) | increment);
        }
    }

    function _decrementBalances(
        uint256[] memory decrements,
        uint256 _i,
        uint256 _end,
        address[] memory _addresses
    )
        private
    {
        for(_i; _i <= _end; _i++) {
            uint256 decrement = decrements[_i];
            if (decrement == 0) { continue; }

            balances[_addresses[_i * 2]][_addresses[_i * 2 + 1]] =
            balances[_addresses[_i * 2]][_addresses[_i * 2 + 1]].sub(decrement);

            emit Decrement(_i << 248 | decrement);
        }
    }
}
