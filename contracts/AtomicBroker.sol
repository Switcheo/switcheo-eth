pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Broker.sol";

/// @title The Atomic Swap contract for Switcheo Exchange
/// @author Switcheo Network
/// @notice This contract faciliates crosschain trades
/// between users through a time locked Atomic Swap.
/// The contract transfers assets by updating the balances
/// in the Switcheo Broker contract.
contract AtomicBroker {
    using SafeMath for uint256;

    // The Switcheo Broker contract
    Broker public broker;

    // Creating a swap
    uint8 constant ReasonSwapMakerGive = 0x30;
    uint8 constant ReasonSwapHolderReceive = 0x31;
    uint8 constant ReasonSwapMakerFeeGive = 0x32;
    uint8 constant ReasonSwapHolderFeeReceive = 0x33;

    // Executing a swap
    uint8 constant ReasonSwapHolderGive = 0x34;
    uint8 constant ReasonSwapTakerReceive = 0x35;
    uint8 constant ReasonSwapFeeGive = 0x36;
    uint8 constant ReasonSwapFeeReceive = 0x37;

    // Cancelling a swap
    uint8 constant ReasonSwapCancelMakerReceive = 0x38;
    uint8 constant ReasonSwapCancelHolderGive = 0x39;
    uint8 constant ReasonSwapCancelFeeGive = 0x3A;
    uint8 constant ReasonSwapCancelFeeReceive = 0x3B;
    uint8 constant ReasonSwapCancelFeeRefundGive = 0x3C;
    uint8 constant ReasonSwapCancelFeeRefundReceive = 0x3D;

    // Swaps by: swapHash => swapIsActive
    mapping(bytes32 => bool) public swaps;
    // A record of which hashes have been used before
    mapping(bytes32 => bool) public usedHashes;

    // Emitted when a new swap is created
    event CreateSwap(
        address indexed maker,
        address indexed taker,
        address token,
        uint256 amount,
        bytes32 indexed hashedSecret,
        uint256 expiryTime,
        address feeAsset,
        uint256 feeAmount
    );

    // Emitted when a swap is executed
    event ExecuteSwap(bytes32 indexed hashedSecret);

    // Emitted when a swap is cancelled
    event CancelSwap(bytes32 indexed hashedSecret);

    /// @notice Initializes the Atomic Broker contract
    /// @dev The broker is initialized to the Switcheo Broker
    constructor(address brokerAddress)
        public
    {
        broker = Broker(brokerAddress);
    }

    modifier onlyCoordinator() {
        require(
            msg.sender == address(broker.coordinator()),
            "Invalid sender"
        );
        _;
    }

    /// @notice Approves the Broker contract to update balances for this contract
    /// @dev The swap maker's balances are locked by transferring the balance to be
    /// locked to this contract within the Broker contract.
    /// To release the locked balances to the swap taker, this contract must approve
    /// itself as a spender of its own balances within the Broker contract.
    function approveBroker()
        external
    {
        broker.approveSpender(address(this));
    }

    /// @notice Creates a swap to initiate the transfer of assets.
    /// @dev Creates a swap to transfer `_amount` of `_token` to `_taker`
    /// The transfer is completed when executeSwap is called with the correct
    /// preimage matching the `_hashedSecret`.
    /// If executeSwap is not called, the transfer can be cancelled after
    /// `expiryTime` has passed.
    /// This operation can only be invoked by the coordinator.
    /// @param _maker The address of the user that is making the swap
    /// @param _taker The address of the user that is taking the swap
    /// @param _token The address of the token to be transferred
    /// @param _amount The number of tokens to be transferred
    /// @param _hashedSecret The hash of the secret decided on by the maker
    /// @param _expiryTime The epoch time of when the swap becomes cancellable
    /// @param _feeAsset The address of the token to use for fee payment
    /// @param _feeAmount The amount of tokens to pay as fees to the operator
    /// @param _v The `v` component of the `_maker`'s signature
    /// @param _r The `r` component of the `_maker`'s signature
    /// @param _s The `s` component of the `_maker`'s signature
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
        onlyCoordinator
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

        bytes32 msgHash = _hashSwapParams(
            _maker,
            _taker,
            _token,
            _amount,
            _hashedSecret,
            _expiryTime,
            _feeAsset,
            _feeAmount
        );

        require(
            _recoverAddress(msgHash, _v, _r, _s) == _maker,
            "Invalid signature"
        );

        if (_feeAsset == _token) {
            require(
                _feeAmount < _amount,
                "Fee amount exceeds amount"
            );
        }

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

        swaps[msgHash] = true;

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

    /// @notice Executes a swap that has been previously made using `createSwap`.
    /// @dev Transfers the previously locked asset from createSwap to the swap taker.
    /// The original swap parameters need to be resent as only the hash of these
    /// parameters are stored in `swaps`.
    /// @param _maker The address of the user that is making the swap
    /// @param _taker The address of the user that is taking the swap
    /// @param _token The address of the token to be transferred
    /// @param _amount The number of tokens to be transferred
    /// @param _hashedSecret The hash of the secret decided on by the maker
    /// @param _expiryTime The epoch time of when the swap becomes cancellable
    /// @param _feeAsset The address of the token to use for fee payment
    /// @param _feeAmount The amount of tokens to pay as fees to the operator
    /// @param _preimage The preimage matching the _hashedSecret
    function executeSwap (
        address _maker,
        address _taker,
        address _token,
        uint256 _amount,
        bytes32 _hashedSecret,
        uint256 _expiryTime,
        address _feeAsset,
        uint256 _feeAmount,
        bytes _preimage
    )
        external
    {
        bytes32 msgHash = _hashSwapParams(
            _maker,
            _taker,
            _token,
            _amount,
            _hashedSecret,
            _expiryTime,
            _feeAsset,
            _feeAmount
        );

        require(
            swaps[msgHash] == true,
            "Swap is inactive"
        );

        require(
            sha256(abi.encodePacked(sha256(_preimage))) == _hashedSecret,
            "Invalid preimage"
        );

        uint256 takeAmount = _amount;
        if (_token == _feeAsset) {
            takeAmount -= _feeAmount;
        }

        delete swaps[msgHash];

        broker.spendFrom(
            address(this),
            _taker,
            takeAmount,
            _token,
            ReasonSwapHolderGive,
            ReasonSwapTakerReceive
        );

        if (_feeAmount > 0) {
            broker.spendFrom(
                address(this),
                address(broker.operator()),
                _feeAmount,
                _feeAsset,
                ReasonSwapFeeGive,
                ReasonSwapFeeReceive
            );
        }

        emit ExecuteSwap(_hashedSecret);
    }


    /// @notice Cancels a swap that was previously made using `createSwap`.
    /// @dev Cancels the swap with matching msgHash, releasing the locked assets
    /// back to the maker.
    /// The original swap parameters need to be resent as only the hash of these
    /// parameters are stored in `swaps`.
    /// The `_cancelFeeAmount` is deducted from the `_feeAmount` of the original swap.
    /// The remaining fee amount is refunded to the user.
    /// If the sender is not the coordinator, then the full _feeAmount is deducted.
    /// This gives the coordinator control to incentivise users to complete a swap once initiated.
    /// @param _maker The address of the user that is making the swap
    /// @param _taker The address of the user that is taking the swap
    /// @param _token The address of the token to be transferred
    /// @param _amount The number of tokens to be transferred
    /// @param _hashedSecret The hash of the secret decided on by the maker
    /// @param _expiryTime The epoch time of when the swap becomes cancellable
    /// @param _feeAsset The address of the token to use for fee payment
    /// @param _feeAmount The amount of tokens to pay as fees to the operator
    /// @param _cancelFeeAmount The number of tokens from the original `_feeAmount` to be deducted as
    /// cancellation fees
    function cancelSwap (
        address _maker,
        address _taker,
        address _token,
        uint256 _amount,
        bytes32 _hashedSecret,
        uint256 _expiryTime,
        address _feeAsset,
        uint256 _feeAmount,
        uint256 _cancelFeeAmount
    )
        external
    {
        require(
            _expiryTime <= now,
            "Cancellation time not yet reached"
        );

        bytes32 msgHash = _hashSwapParams(
            _maker,
            _taker,
            _token,
            _amount,
            _hashedSecret,
            _expiryTime,
            _feeAsset,
            _feeAmount
        );

        require(
            swaps[msgHash] == true,
            "Swap is inactive"
        );

        uint256 cancelFeeAmount = _cancelFeeAmount;
        if (msg.sender != address(broker.coordinator())) {
            cancelFeeAmount = _feeAmount;
        }

        require(
            cancelFeeAmount <= _feeAmount,
            "Cancel fee must be less than swap fee"
        );

        uint256 refundAmount = _amount;
        if (_token == _feeAsset) {
            refundAmount -= cancelFeeAmount;
        }

        delete swaps[msgHash];

        broker.spendFrom(
            address(this),
            _maker,
            refundAmount,
            _token,
            ReasonSwapCancelHolderGive,
            ReasonSwapCancelMakerReceive
        );

        if (_feeAmount > 0) {
            broker.spendFrom(
                address(this),
                address(broker.operator()),
                cancelFeeAmount,
                _feeAsset,
                ReasonSwapCancelFeeGive,
                ReasonSwapCancelFeeReceive
            );
        }

        uint256 refundFeeAmount = _feeAmount - cancelFeeAmount;
        if (_token != _feeAsset && refundFeeAmount > 0) {
            broker.spendFrom(
                address(this),
                _maker,
                refundFeeAmount,
                _feeAsset,
                ReasonSwapCancelFeeRefundGive,
                ReasonSwapCancelFeeRefundReceive
            );
        }

        emit CancelSwap(_hashedSecret);
    }

    function _hashSwapParams(
        address _maker,
        address _taker,
        address _token,
        uint256 _amount,
        bytes32 _hashedSecret,
        uint256 _expiryTime,
        address _feeAsset,
        uint256 _feeAmount
    )
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(
            "swap",
            _maker,
            _taker,
            _token,
            _amount,
            _hashedSecret,
            _expiryTime,
            _feeAsset,
            _feeAmount
        ));
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
