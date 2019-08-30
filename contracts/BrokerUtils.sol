pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";

interface ERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

interface KyberNetworkProxy {
    function tradeWithHint(address src, uint256 srcAmount, address dest, address destAddress, uint256 maxDestAmount, uint256 minConversionRate, address walletId, bytes calldata hint) external returns (uint256);
}

interface UniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}

interface UniswapExchange {
    // Trade ETH to ERC20
    function ethToTokenSwapInput(uint256 minTokens, uint256 deadline) external payable returns (uint256 tokensBought);
    // Trade ERC20 to ETH
    function tokenToEthSwapInput(uint256 tokensSold, uint256 minEth, uint256 deadline) external returns (uint256 ethBought);
    // Trade ERC20 to ERC20
    function tokenToTokenSwapInput(uint256 tokensSold, uint256 minTokensBought, uint256 minEthBought, uint256 deadline, address tokenAddr) external returns (uint256 tokensBought);
}

/// @title Validations for the BrokerV2 contract for Switcheo Exchange
/// @author Switcheo Network
/// @notice Validations were moved from the BrokerV2 contract into this library
/// so that the BrokerV2 contract would not exceed the maximum contract size of
/// 24 KB.
library BrokerUtils {
    using SafeMath for uint256;

    // The constants for EIP-712 are precompiled to reduce contract size,
    // the original values are left here for reference and verification.
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

    // bytes32 public constant FILL_TYPEHASH = keccak256(abi.encodePacked(
    //     "Fill(",
    //         "address filler,",
    //         "address offerAssetId,",
    //         "uint256 offerAmount,",
    //         "address wantAssetId,",
    //         "uint256 wantAmount,",
    //         "address feeAssetId,",
    //         "uint256 feeAmount,",
    //         "uint256 nonce",
    //     ")"
    // ));
    bytes32 public constant FILL_TYPEHASH = 0x5f59dbc3412a4575afed909d028055a91a4250ce92235f6790c155a4b2669e99;

    address private constant ETHER_ADDR = address(0);

    /// @dev Validates `BrokerV2.trade` parameters to ensure trade fairness,
    /// see `BrokerV2.trade` for param details.
    /// @param _values Values from `trade`
    /// @param _hashes Hashes from `trade`
    /// @param _addresses Addresses from `trade`
    function validateTrades(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses
    )
        external
        pure
        returns (bytes32[] memory)
    {
        _validateTradeInputLengths(_values, _hashes);
        _validateUniqueOffers(_values);
        _validateMatches(_values, _addresses);
        _validateFillAmounts(_values);
        _validateTradeData(_values, _addresses);

        // validate signatures of all fills
        _validateTradeSignatures(
            _values,
            _hashes,
            _addresses,
            FILL_TYPEHASH,
            _values[0] & ~(~uint256(0) << 8), // numOffers
            (_values[0] & ~(~uint256(0) << 8)) + ((_values[0] & ~(~uint256(0) << 16)) >> 8) // numOffers + numFills
        );

        // validate signatures of all offers
        return _validateTradeSignatures(
            _values,
            _hashes,
            _addresses,
            OFFER_TYPEHASH,
            0,
            _values[0] & ~(~uint256(0) << 8) // numOffers
        );
    }

    function validateNetworkTrades(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses
    )
        external
        pure
        returns (bytes32[] memory)
    {
        _validateNetworkTradeInputLengths(_values, _hashes);
        _validateUniqueOffers(_values);
        // TODO: validate matches
        _validateTradeData(_values, _addresses);

        // validate signatures of all offers
        return _validateTradeSignatures(
            _values,
            _hashes,
            _addresses,
            OFFER_TYPEHASH,
            0,
            _values[0] & ~(~uint256(0) << 8) // numOffers
        );
    }

    function performNetworkTrades(
        uint256[] calldata _values,
        address[] calldata _addresses,
        address[] calldata _tradeProviders
    )
        external
        returns (uint256[] memory)
    {
        uint256[] memory increments = new uint256[](_addresses.length / 2);
        // i = 1 + numOffers * 2
        uint256 i = 1 + (_values[0] & ~(~uint256(0) << 8)) * 2;
        uint256 end = _values.length;

        // loop matches
        for(i; i < end; i++) {
            uint256[] memory data = new uint256[](9);
            data[0] = _values[i]; // match data
            data[1] = data[0] & ~(~uint256(0) << 8); // offerIndex
            data[2] = (data[0] & ~(~uint256(0) << 24)) >> 16; // operator.surplusAssetIndex
            data[3] = _values[data[1] * 2 + 1]; // offer.dataA
            data[4] = _values[data[1] * 2 + 2]; // offer.dataB
            data[5] = ((data[3] & ~(~uint256(0) << 16)) >> 8); // maker.offerAssetIndex
            data[6] = ((data[3] & ~(~uint256(0) << 24)) >> 16); // maker.wantAssetIndex
            // amount of offerAssetId to take from offer is equal to the match.takeAmount
            data[7] = data[0] >> 128;
            // expected amount to receive is: matchData.takeAmount * offer.wantAmount / offer.offerAmount
            data[8] = data[7].mul(data[4] >> 128).div(data[4] & ~(~uint256(0) << 128));

            increments[data[2]] = _performNetworkTrade(
                _addresses[data[5] * 2 + 1], // offer.offerAssetId
                data[7], // the proportion of offerAmount to offer
                _addresses[data[6] * 2 + 1], // offer.wantAssetId
                data[8], // the propotionate wantAmount of the offer
                _addresses[data[2] * 2 + 1], // surplusAssetId
                data[0], // match data
                _tradeProviders
            );
        }

        return increments;
    }

    function transferTokensIn(
        address _user,
        address _assetId,
        uint256 _amount,
        uint256 _expectedAmount
    )
        external
    {
        _validateContractAddress(_assetId);

        uint256 initialBalance = _tokenBalance(_assetId);

        // Some tokens have a `transferFrom` which returns a boolean and some do not.
        // The ERC20 interface cannot be used here because it requires specifying
        // an explicit return value, and an EVM exception would be raised when calling
        // a token with the mismatched return value.
        bytes memory payload = abi.encodeWithSignature(
            "transferFrom(address,address,uint256)",
            _user,
            address(this),
            _amount
        );
        bytes memory returnData = _callContract(_assetId, payload);
        // Ensure that the asset transfer succeeded
        _validateTransferResult(returnData);

        uint256 finalBalance = _tokenBalance(_assetId);
        uint256 transferredAmount = finalBalance.sub(initialBalance);

        // Error code 46: transferTokensIn, transferredAmount does not match expectedAmount
        require(transferredAmount == _expectedAmount, "46");
    }

    function transferTokensOut(
        address _receivingAddress,
        address _assetId,
        uint256 _amount
    )
        external
    {
        _validateContractAddress(_assetId);

        bytes memory payload = abi.encodeWithSignature(
                                   "transfer(address,uint256)",
                                   _receivingAddress,
                                   _amount
                               );
        bytes memory returnData = _callContract(_assetId, payload);

        // Ensure that the asset transfer succeeded
        _validateTransferResult(returnData);
    }

    // _data
    // bits(0..8): offerIndex
    // bits(8..16): tradeProvider
    // bits(16..24): operator.surplusAssetIndex
    // bits(24..128): provider-specific data
    // bits(128..256): match.takeAmount
    function _performNetworkTrade(
        address _offerAssetId,
        uint256 _offerAmount,
        address _wantAssetId,
        uint256 _wantAmount,
        address _surplusAssetId,
        uint256 _data,
        address[] memory _tradeProviders
    )
        private
        returns (uint256)
    {
        uint256 tradeProvider = (_data & ~(~uint256(0) << 16)) >> 8;

        uint256[] memory funds = new uint256[](6);
        funds[0] = _externalBalance(_offerAssetId); // initialOfferTokenBalance
        funds[1] = _externalBalance(_wantAssetId); // initialWantTokenBalance
        if (_surplusAssetId != _offerAssetId && _surplusAssetId != _wantAssetId) {
            funds[2] = _externalBalance(_surplusAssetId); // initialSurplusTokenBalance
        }

        if (tradeProvider == 0) {
            // perform KyberSwap trade
        } else if (tradeProvider == 1) {
            _performUniswapTrade(
                _offerAssetId,
                _offerAmount,
                _wantAssetId,
                _wantAmount,
                _data,
                _tradeProviders[1]
            );
        }

        funds[3] = _externalBalance(_offerAssetId); // finalOfferTokenBalance
        funds[4] = _externalBalance(_wantAssetId); // finalWantTokenBalance
        if (_surplusAssetId != _offerAssetId && _surplusAssetId != _wantAssetId) {
            funds[5] = _externalBalance(_surplusAssetId); // finalSurplusTokenBalance
        }

        uint256 surplusAmount = 0;

        // validate that appropriate offerAmount was deducted
        if (_surplusAssetId == _offerAssetId) {
            // finalOfferTokenBalance >= initialOfferTokenBalance - offerAmount
            require(funds[3] >= funds[0].sub(_offerAmount));
            // surplusAmount = finalOfferTokenBalance - (initialOfferTokenBalance - offerAmount)
            surplusAmount = funds[3].sub((funds[0].sub(_offerAmount)));
        } else {
            // finalOfferTokenBalance == initialOfferTokenBalance - offerAmount
            require(funds[3] == funds[0].sub(_offerAmount));
        }

        // validate that appropriate wantAmount was credited
        if (_surplusAssetId == _wantAssetId) {
            // finalWantTokenBalance >= initialWantTokenBalance + wantAmount
            require(funds[4] >= funds[1].add(_wantAmount));
            // surplusAmount = finalWantTokenBalance - (initialWantTokenBalance + wantAmount)
            surplusAmount = funds[4].sub((funds[1].add(_wantAmount)));
        } else {
            // finalWantTokenBalance == initialWantTokenBalance + wantAmount
            require(funds[4] == funds[1].add(_wantAmount));
        }

        if (_surplusAssetId != _offerAssetId && _surplusAssetId != _wantAssetId) {
            surplusAmount = funds[5].sub(funds[2]);
        }

        return surplusAmount;
    }

    function _performUniswapTrade(
        address _offerAssetId,
        uint256 _offerAmount,
        address _wantAssetId,
        uint256 _wantAmount,
        uint256 _data,
        address _factoryAddress
    )
        private
    {
        UniswapFactory factory = UniswapFactory(_factoryAddress);
        // _data bits(24..56): delay
        uint256 deadline = now + ((_data & ~(~uint256(0) << 56)) >> 24);

        if (_offerAssetId == ETHER_ADDR) {
            UniswapExchange exchange = UniswapExchange(factory.getExchange(_wantAssetId));
            exchange.ethToTokenSwapInput.value(_offerAmount)(_wantAmount, deadline);
            return;
        }

        address exchangeAddress = factory.getExchange(_offerAssetId);
        UniswapExchange exchange = UniswapExchange(exchangeAddress);

        ERC20(_offerAssetId).approve(exchangeAddress, _offerAmount);

        if (_wantAssetId == ETHER_ADDR) {
            exchange.tokenToEthSwapInput(_offerAmount, _wantAmount, deadline);
            return;
        }

        // Use the minimum of 1 for minEth as the amount of intermediate eth
        // used for the trade is not important. It is only important that the
        // final received tokens is more than or equal to the wantAmount.
        exchange.tokenToTokenSwapInput(_offerAmount, _wantAmount, 1, deadline, _wantAssetId);
    }


    function _tokenBalance(address _assetId) private view returns (uint256) {
        return ERC20(_assetId).balanceOf(address(this));
    }

    function _externalBalance(address _assetId) private view returns (uint256) {
        if (_assetId == ETHER_ADDR) {
            return address(this).balance;
        }
        return ERC20(_assetId).balanceOf(address(this));
    }

    /// @dev Validates that input lengths based on the expected format
    /// detailed in the `trade` method.
    /// @param _values Values from `trade`
    /// @param _hashes Hashes from `trade`
    function _validateTradeInputLengths(
        uint256[] memory _values,
        bytes32[] memory _hashes
    )
        private
        pure
    {
        uint256 numOffers = _values[0] & ~(~uint256(0) << 8);
        uint256 numFills = (_values[0] & ~(~uint256(0) << 16)) >> 8;
        uint256 numMatches = (_values[0] & ~(~uint256(0) << 24)) >> 16;

        // It is enforced by other checks that if a fill is present
        // then it must be completely filled so there must be at least one offer
        // and at least one match in this case.
        // It is possible to have one offer with no matches and no fills
        // but that is blocked by this check as there is no foreseeable use
        // case for it.
        // Error code 47: _validateTradeInputLengths, invalid trade input lengths
        require(numOffers > 0 && numFills > 0 && numMatches > 0, "47");

        // Error code 48: _validateTradeInputLengths, invalid _values.length
        require(_values.length == 1 + numOffers * 2 + numFills * 2 + numMatches, "48");

        // Error code 49: _validateTradeInputLengths, invalid _hashes.length
        require(_hashes.length == (numOffers + numFills) * 2, "49");
    }

    function _validateNetworkTradeInputLengths(
        uint256[] memory _values,
        bytes32[] memory _hashes
    )
        private
        pure
    {
        uint256 numOffers = _values[0] & ~(~uint256(0) << 8);
        uint256 numFills = (_values[0] & ~(~uint256(0) << 16)) >> 8;
        uint256 numMatches = (_values[0] & ~(~uint256(0) << 24)) >> 16;

        // Error code 65: _validateNetworkTradeInputLengths, invalid trade input lengths
        require(numOffers > 0 && numMatches > 0 && numFills == 0, "65");

        // Error code 66: _validateNetworkTradeInputLengths, invalid _values.length
        require(_values.length == 1 + numOffers * 2 + numFills * 2 + numMatches, "66");

        // Error code 67: _validateNetworkTradeInputLengths, invalid _hashes.length
        require(_hashes.length == (numOffers + numFills) * 2, "67");
    }

    /// @dev See the `BrokerV2.trade` method for an explanation of why offer
    /// uniquness is required.
    /// The set of offers in `_values` must be sorted such that offer nonces'
    /// are arranged in a strictly ascending order.
    /// This allows the validation of offer uniqueness to be done in O(N) time,
    /// with N being the number of offers.
    /// @param _values Values from `trade`
    function _validateUniqueOffers(uint256[] memory _values) private pure {
        uint256 numOffers = _values[0] & ~(~uint256(0) << 8);

        uint256 prevNonce;
        uint256 mask = ~(~uint256(0) << 128);

        for(uint256 i = 0; i < numOffers; i++) {
            uint256 nonce = (_values[i * 2 + 1] & mask) >> 48;

            if (i == 0) {
                // Set the value of the first nonce
                prevNonce = nonce;
                continue;
            }

            // Error code 50: _validateUniqueOffers, invalid offer nonces
            require(nonce > prevNonce, "50");
            prevNonce = nonce;
        }
    }

    /// @dev Validate that for every match:
    /// 1. offerIndexes fall within the range of offers
    /// 2. fillIndexes falls within the range of fills
    /// 3. offer.offerAssetId == fill.wantAssetId
    /// 4. offer.wantAssetId == fill.offerAssetId
    /// 5. takeAmount > 0
    /// 6. (offer.wantAmount * takeAmount) % offer.offerAmount == 0
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
    function _validateMatches(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
        pure
    {
        uint256 i = 1;
        // i += numOffers * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        uint256 numOffers = _values[0] & ~(~uint256(0) << 8);
        uint256 numFills = (_values[0] & ~(~uint256(0) << 16)) >> 8;

        // loop matches
        for (i; i < end; i++) {
            uint256 offerIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 fillIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;

            // Error code 51: _validateMatches, invalid match.offerIndex
            require(offerIndex < numOffers, "51");

            // Error code 52: Invalid match.fillIndex
            require(fillIndex >= numOffers && fillIndex < numOffers + numFills, "52");

            uint256 makerOfferAssetIndex = (_values[1 + offerIndex * 2] & ~(~uint256(0) << 16)) >> 8;
            uint256 makerWantAssetIndex = (_values[1 + offerIndex * 2] & ~(~uint256(0) << 24)) >> 16;
            uint256 fillerOfferAssetIndex = (_values[1 + fillIndex * 2] & ~(~uint256(0) << 16)) >> 8;
            uint256 fillerWantAssetIndex = (_values[1 + fillIndex * 2] & ~(~uint256(0) << 24)) >> 16;

            // Error code 53: _validateMatches, offer.offerAssetId does not match fill.wantAssetId
            require(
                _addresses[makerOfferAssetIndex * 2 + 1] == _addresses[fillerWantAssetIndex * 2 + 1],
                "53"
            );

            require(
                // Error code 54: _validateMatches, offer.wantAssetId does not match fill.offerAssetId
                _addresses[makerWantAssetIndex * 2 + 1] == _addresses[fillerOfferAssetIndex * 2 + 1],
                "54"
            );

            // require that bits(16..128) are all zero for every match
            // Error code 55: _validateMatches, invalid match data
            require((_values[i] & ~(~uint256(0) << 128)) >> 16 == uint256(0), "55");

            uint256 takeAmount = _values[i] >> 128;
            // Error code 56: _validateMatches, invalid match.takeAmount
            require(takeAmount > 0, "56");

            uint256 offerDataB = _values[2 + offerIndex * 2];
            // (offer.wantAmount * takeAmount) % offer.offerAmount == 0
            // Error code 57: _validateMatches, invalid amounts
            require(
                (offerDataB >> 128).mul(takeAmount).mod(offerDataB & ~(~uint256(0) << 128)) == 0,
                "57"
            );
        }
    }

    /// @dev Validate that all fills will be completely filled by the specified
    /// matches. See the `BrokerV2.trade` method for an explanation of why
    /// fills must be completely filled.
    /// @param _values Values from `trade`
    function _validateFillAmounts(uint256[] memory _values) private pure {
        // "filled" is used to store the sum of `takeAmount`s and `giveAmount`s.
        // While a fill's `offerAmount` and `wantAmount` are combined to share
        // a single uint256 value, each sum of `takeAmount`s and `giveAmount`s
        // for a fill is tracked with an individual uint256 value.
        // This is to prevent the verification from being vulnerable to overflow
        // issues.
        uint256[] memory filled = new uint256[](_values.length);

        uint256 i = 1;
        // i += numOffers * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        // loop matches
        for (i; i < end; i++) {
            uint256 offerIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 fillIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;
            uint256 takeAmount = _values[i] >> 128;
            uint256 wantAmount = _values[2 + offerIndex * 2] >> 128;
            uint256 offerAmount = _values[2 + offerIndex * 2] & ~(~uint256(0) << 128);
            // giveAmount = takeAmount * wantAmount / offerAmount
            uint256 giveAmount = takeAmount.mul(wantAmount).div(offerAmount);

            // (1 + fillIndex * 2) would give the index of the first part
            // of the data for the fill at fillIndex within `_values`,
            // and (2 + fillIndex * 2) would give the index of the second part
            filled[1 + fillIndex * 2] = filled[1 + fillIndex * 2].add(giveAmount);
            filled[2 + fillIndex * 2] = filled[2 + fillIndex * 2].add(takeAmount);
        }

        // numOffers
        i = (_values[0] & ~(~uint256(0) << 8));
        // i + numFills
        end = i + ((_values[0] & ~(~uint256(0) << 16)) >> 8);

        // loop fills
        for(i; i < end; i++) {
            // Error code 58: _validateFillAmounts, invalid fills
            require(
                // fill.offerAmount == (sum of given amounts for fill)
                _values[i * 2 + 2] & ~(~uint256(0) << 128) == filled[i * 2 + 1] &&
                // fill.wantAmount == (sum of taken amounts for fill)
                _values[i * 2 + 2] >> 128 == filled[i * 2 + 2],
                "58"
            );
        }
    }

    /// @dev Validates that for every offer / fill:
    /// 1. offerAssetId != wantAssetId
    /// 2. offerAmount > 0 && wantAmount > 0
    /// 3. Specified `operator` address matches the expected `operator` address
    /// (3) is needed because the operator address in `_addresses` is
    /// externally set.
    /// @param _values Values from `trade`
    /// @param _addresses Addresses from `trade`
    function _validateTradeData(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
        pure
    {
        // numOffers + numFills
        uint256 end = (_values[0] & ~(~uint256(0) << 8)) +
                      ((_values[0] & ~(~uint256(0) << 16)) >> 8);

        for (uint256 i = 0; i < end; i++) {
            uint256 dataA = _values[i * 2 + 1];
            uint256 dataB = _values[i * 2 + 2];

            // Error code 59: _validateTradeData, invalid trade assets
            require(
                // offerAssetId != wantAssetId
                _addresses[((dataA & ~(~uint256(0) << 16)) >> 8) * 2 + 1] !=
                _addresses[((dataA & ~(~uint256(0) << 24)) >> 16) * 2 + 1],
                "59"
            );

            // Error code 60: _validateTradeData, invalid trade amounts
            require(
                // offerAmount > 0 && wantAmount > 0
                (dataB & ~(~uint256(0) << 128)) > 0 && (dataB >> 128) > 0,
                "60"
            );
        }
    }

    /// @dev Validates signatures for a set of offers or fills
    /// @param _values Values from `trade`
    /// @param _hashes Hashes from `trade`
    /// @param _addresses Addresses from `trade`
    /// @param _typehash The typehash used to construct the signed hash
    /// @param _i The starting index to verify
    /// @param _end The ending index to verify
    /// @return An array of hash keys if _i started as 0, because only
    /// the hash keys of offers are needed
    function _validateTradeSignatures(
        uint256[] memory _values,
        bytes32[] memory _hashes,
        address[] memory _addresses,
        bytes32 _typehash,
        uint256 _i,
        uint256 _end
    )
        private
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory hashKeys;
        if (_i == 0) {
            hashKeys = new bytes32[](_end - _i);
        }

        for (_i; _i < _end; _i++) {
            uint256 dataA = _values[_i * 2 + 1];
            uint256 dataB = _values[_i * 2 + 2];

            bytes32 hashKey = keccak256(abi.encode(
                _typehash,
                _addresses[(dataA & ~(~uint256(0) << 8)) * 2], // user
                _addresses[((dataA & ~(~uint256(0) << 16)) >> 8) * 2 + 1], // offerAssetId
                dataB & ~(~uint256(0) << 128), // offerAmount
                _addresses[((dataA & ~(~uint256(0) << 24)) >> 16) * 2 + 1], // wantAssetId
                dataB >> 128, // wantAmount
                _addresses[((dataA & ~(~uint256(0) << 32)) >> 24) * 2 + 1], // feeAssetId
                dataA >> 128, // feeAmount
                (dataA & ~(~uint256(0) << 128)) >> 48 // nonce
            ));

            // To reduce gas costs, each bit of _values[0] after the 24th bit
            // is used to indicate whether the Ethereum signed message prefix
            // should be prepended for signature verification of the offer / fill
            // at that index
            bool prefixedSignature = _values[0] & (uint256(1) << (24 + _i)) != 0;

            _validateSignature(
                hashKey,
                _addresses[(dataA & ~(~uint256(0) << 8)) * 2], // user
                uint8((dataA & ~(~uint256(0) << 48)) >> 40), // The `v` component of the user's signature
                _hashes[_i * 2], // The `r` component of the user's signature
                _hashes[_i * 2 + 1], // The `s` component of the user's signature
                prefixedSignature
            );

            if (hashKeys.length > 0) { hashKeys[_i] = hashKey; }
        }

        return hashKeys;
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

    /// @dev Ensure that the address is a deployed contract
    /// @param _contract The address to check
    function _validateContractAddress(address _contract) private view {
        assembly {
            if iszero(extcodesize(_contract)) { revert(0, 0) }
        }
    }

    /// @dev A thin wrapper around the native `call` function, to
    /// validate that the contract `call` must be successful.
    /// See https://solidity.readthedocs.io/en/v0.5.1/050-breaking-changes.html
    /// for details on constructing the `_payload`
    /// @param _contract Address of the contract to call
    /// @param _payload The data to call the contract with
    /// @return The data returned from the contract call
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
        // Error code 63: _callContract, contract call failed
        require(success, "63");

        return returnData;
    }

    /// @dev Fix for ERC-20 tokens that do not have proper return type
    /// See: https://github.com/ethereum/solidity/issues/4116
    /// https://medium.com/loopring-protocol/an-incompatibility-in-smart-contract-threatening-dapp-ecosystem-72b8ca5db4da
    /// https://github.com/sec-bit/badERC20Fix/blob/master/badERC20Fix.sol
    /// @param _data The data returned from a transfer call
    function _validateTransferResult(bytes memory _data) private pure {
        // Error code 64: _validateTransferResult, invalid transfer result
        require(
            _data.length == 0 ||
            (_data.length == 32 && _getUint256FromBytes(_data) != 0),
            "64"
        );
    }

    /// @dev Converts data of type `bytes` into its corresponding `uint256` value
    /// @param _data The data in bytes
    /// @return The corresponding `uint256` value
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
