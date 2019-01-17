pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Broker.sol";

/// @title The Atomic Swap contract for Switcheo Exchange
/// @author Switcheo Network
contract AtomicBroker {
    using SafeMath for uint256;

    struct Swap {
        address maker;
        address taker;
        address token;
        address feeAsset;
        uint256 amount;
        uint256 expiryTime;
        uint256 feeAmount;
        bool active;
    }

    Broker public broker;

    // The maximum announce delay in seconds
    // (7 days * 24 hours * 60 mins * 60 seconds)
    uint32 constant maxCancelDelay = 604800;

    // Creating a swap
    uint8 constant ReasonSwapMakerGive = 0x16;
    uint8 constant ReasonSwapHolderReceive = 0x17;
    uint8 constant ReasonSwapMakerFeeGive = 0x18;
    uint8 constant ReasonSwapHolderFeeReceive = 0x19;

    // Executing a swap
    uint8 constant ReasonSwapHolderGive = 0x20;
    uint8 constant ReasonSwapTakerReceive = 0x21;
    uint8 constant ReasonSwapFeeGive = 0x22;
    uint8 constant ReasonSwapFeeReceive = 0x23;

    // Cancelling a swap
    uint8 constant ReasonSwapCancelMakerReceive = 0x24;
    uint8 constant ReasonSwapCancelHolderGive = 0x25;
    uint8 constant ReasonSwapCancelFeeGive = 0x26;
    uint8 constant ReasonSwapCancelFeeReceive = 0x27;
    uint8 constant ReasonSwapCancelFeeRefundGive = 0x28;
    uint8 constant ReasonSwapCancelFeeRefundReceive = 0x29;

    // Swaps by: hashedSecret => swap
    mapping(bytes32 => Swap) public swaps;
    // A record of which hashes have been used before
    mapping(bytes32 => bool) public usedHashes;

    // Emitted when a new swap is created
    event CreateSwap(
        address indexed maker,
        address indexed taker,
        address token,
        uint256 amount,
        bytes32 indexed hashedSecret,
        uint256 _expiryTime,
        address _feeAsset,
        uint256 _feeAmount
    );

    // Emitted when a swap is executed
    event ExecuteSwap(bytes32 indexed hashedSecret);

    // Emitted when a swap is cancelled
    event CancelSwap(bytes32 indexed hashedSecret);

    constructor(address brokerAddress)
        public
    {
        broker = Broker(brokerAddress);
    }

    modifier onlyOwner() {
        require(
            msg.sender == address(broker.owner()),
            "Invalid sender"
        );
        _;
    }

    function approveBroker()
        external
    {
        broker.approveSpender(address(this));
    }

    function createSwap(
        address _maker,
        address _taker,
        address _token,
        uint256 _amount,
        bytes32 _hashedSecret,
        uint256 _expiryTime,
        address _feeAsset,
        uint256 _feeAmount,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
    {
        require(
            _amount > 0,
            "Invalid amount"
        );

        require(
            _expiryTime > now,
            "Invalid expiry time"
        );

        _validateAndAddHash(_hashedSecret);

        bytes32 msgHash = keccak256(abi.encodePacked(
            "createSwap",
            _maker,
            _taker,
            _token,
            _amount,
            _hashedSecret,
            _expiryTime,
            _feeAsset,
            _feeAmount
        ));

        require(
            _recoverAddress(msgHash, _v, _r, _s) == _maker,
            "Invalid signature"
        );

        broker.spendFrom(
            _maker,
            address(this),
            _amount,
            _token,
            ReasonSwapMakerGive,
            ReasonSwapHolderReceive
        );

        if (_feeAsset != _token)
        {
            broker.spendFrom(
                _maker,
                address(this),
                _feeAmount,
                _feeAsset,
                ReasonSwapMakerFeeGive,
                ReasonSwapHolderFeeReceive
            );
        }

        Swap storage swap = swaps[_hashedSecret];
        swap.maker = _maker;
        swap.taker = _taker;
        swap.token = _token;
        swap.amount = _amount;
        swap.feeAsset = _feeAsset;
        swap.feeAmount = _feeAmount;
        swap.expiryTime = _expiryTime;
        swap.active = true;

        emit CreateSwap(
            _maker,
            _taker,
            _token,
            _amount,
            _hashedSecret,
            _expiryTime,
            _feeAsset,
            _feeAmount
        );
    }

    function executeSwap (
        bytes32 _hashedSecret,
        bytes32 _preimage
    )
        external
    {
        Swap memory swap = swaps[_hashedSecret];

        require(
            swap.active,
            "Swap is inactive"
        );

        require(
            sha256(abi.encodePacked(_preimage)) == _hashedSecret,
            "Invalid preimage"
        );

        uint256 takeAmount = swap.amount;
        if (swap.token == swap.feeAsset) {
            takeAmount -= swap.feeAmount;
        }

        address taker = swap.taker;
        address token = swap.token;
        address feeAsset = swap.feeAsset;
        uint256 feeAmount = swap.feeAmount;

        delete swaps[_hashedSecret];

        broker.spendFrom(
            address(this),
            taker,
            takeAmount,
            token,
            ReasonSwapHolderGive,
            ReasonSwapTakerReceive
        );

        if (feeAmount > 0) {
            broker.spendFrom(
                address(this),
                address(broker.operator()),
                feeAmount,
                feeAsset,
                ReasonSwapFeeGive,
                ReasonSwapFeeReceive
            );
        }

        emit ExecuteSwap(_hashedSecret);
    }

    function cancelSwap (bytes32 _hashedSecret, uint256 _cancelFeeAmount)
        external
    {
        Swap memory swap = swaps[_hashedSecret];

        require(
            swap.active,
            "Swap is inactive"
        );

        require(
            swap.expiryTime <= now,
            "Cancellation time not yet reached"
        );

        uint256 cancelFeeAmount = _cancelFeeAmount;
        if (msg.sender != address(broker.coordinator())) {
            cancelFeeAmount = swap.feeAmount;
        }

        require(
            cancelFeeAmount <= swap.feeAmount,
            "Cancel fee must be less than swap fee"
        );

        uint256 refundAmount = swap.amount;
        if (swap.token == swap.feeAsset) {
            refundAmount -= cancelFeeAmount;
        }

        address maker = swap.maker;
        address token = swap.token;
        address feeAsset = swap.feeAsset;
        uint256 feeAmount = swap.feeAmount;

        delete swaps[_hashedSecret];

        broker.spendFrom(
            address(this),
            maker,
            refundAmount,
            token,
            ReasonSwapCancelHolderGive,
            ReasonSwapCancelMakerReceive
        );

        if (feeAmount > 0) {
            broker.spendFrom(
                address(this),
                address(broker.operator()),
                cancelFeeAmount,
                feeAsset,
                ReasonSwapCancelFeeGive,
                ReasonSwapCancelFeeReceive
            );

        }

        uint256 refundFeeAmount = feeAmount - cancelFeeAmount;
        if (token != feeAsset && refundFeeAmount > 0) {
            broker.spendFrom(
                address(this),
                maker,
                refundFeeAmount,
                feeAsset,
                ReasonSwapCancelFeeRefundGive,
                ReasonSwapCancelFeeRefundReceive
            );
        }

        emit CancelSwap(_hashedSecret);
    }

    /// @dev Performs an `ecrecover` operation for signed message hashes
    /// in accordance to EIP-191.
    function _recoverAddress(bytes32 _hash, uint8 _v, bytes32 _r, bytes32 _s)
        private
        pure
        returns (address)
    {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, _hash));
        return ecrecover(prefixedHash, _v, _r, _s);
    }

    /// @dev Ensures a hash hasn't been already used.
    /// This prevents replay attacks.
    function _validateAndAddHash(bytes32 _hash)
        private
    {
        require(
            usedHashes[_hash] != true,
            "hash already used"
        );

        usedHashes[_hash] = true;
    }
}
