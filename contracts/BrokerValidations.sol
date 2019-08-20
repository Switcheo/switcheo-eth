pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";

library BrokerValidations {
    using SafeMath for uint256;

    bytes32 public constant DOMAIN_SEPARATOR = 0x14f697e312cdba1c10a1eb5c87d96fa22b63aef9dc39592568387471319ea630;
    /* bytes32 public constant DOMAIN_SEPARATOR = keccak256(abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        CONTRACT_NAME,
        CONTRACT_VERSION,
        CHAIN_ID,
        VERIFYING_CONTRACT,
        SALT
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

    function validateTrades(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses,
        address _operator
    )
        external
        pure
        returns (bytes32[] memory)
    {
        _validateTradeInputLengths(_values, _hashes);
        _validateUniqueOffers(_values);
        _validateMatches(_values, _addresses);
        _validateFillAmounts(_values);
        _validateTradeData(_values, _addresses, _operator);

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

        // it is enforced by other checks that if a fill is present
        // then it must be completely filled so there must be at least one offer
        // and at least one match in this case
        // it is possible to have one offer with no matches and no fills
        // but that is blocked by this check as there is no foreseeable use case for it
        require(
            numOffers > 0 && numFills > 0 && numMatches > 0,
            "Invalid trade inputs"
        );

        // the format of _values is:
        // _values[0]: stores the number of offers, fills and matches
        // followed by "numOffers * 2" slots for offer data with each offer taking up two slots
        // followed by "numFills * 2" slots for fill data with each fill taking up two slots
        // followed by "numMatches" slots for match data with each match taking up one slot
        require(
            _values.length == 1 + numOffers * 2 + numFills * 2 + numMatches,
            "Invalid _values.length"
        );

        // the format of _hashes is:
        // "numOffers * 2" slots for r and s signature values, with each offer having one r and one s value
        // "numFills * 2" slots for r and s signature values, with each fill having one r and one s value
        require(
            _hashes.length == (numOffers + numFills) * 2,
            "Invalid _hashes.length"
        );
    }

    // offer uniqueness must be enforced because it would otherwise be possible
    // to repeat an offer within the offers list and cause repeated deductions
    //
    // this is because offer deductions will occur if the offer's nonce has not
    // yet been taken, and for new offers, nonces are only marked as taken
    // at the end of the trade function
    //
    // uniqueness of offers are validated in O(N) time by requiring that
    // offer nonces are in a strictly ascending order
    function _validateUniqueOffers(uint256[] memory _values) private pure {
        uint256 start = 1;
        uint256 numOffers = _values[0] & ~(~uint256(0) << 8);
        uint256 end = start + numOffers * 2;

        uint256 prevNonce;
        uint256 mask = ~(~uint256(0) << 128);

        for(uint256 i = start; i < end; i += 2) {
            uint256 nonce = (_values[i] & mask) >> 48;

            if (i == start) {
                prevNonce = nonce;
                continue;
            }

            require(nonce > prevNonce, "Invalid offer nonces");
            prevNonce = nonce;
        }
    }

    // validate that for every match:
    // 1. offerIndexes fall within the range of offers
    // 2. fillIndexes falls within the range of fills
    // 3. offer.offerAssetId == fill.wantAssetId
    // 4. offer.wantAssetId == fill.offerAssetId
    // 5. takeAmount > 0
    // 6. (offer.wantAmount * takeAmount) % offer.offerAmount == 0
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

            require(
                offerIndex < numOffers,
                "Invalid offerIndex"
            );

            require(
                fillIndex >= numOffers && fillIndex < numOffers + numFills,
                "Invalid fillIndex"
            );

            uint256 makerOfferAssetIndex = (_values[1 + offerIndex * 2] & ~(~uint256(0) << 16)) >> 8;
            uint256 makerWantAssetIndex = (_values[1 + offerIndex * 2] & ~(~uint256(0) << 24)) >> 16;
            uint256 fillerOfferAssetIndex = (_values[1 + fillIndex * 2] & ~(~uint256(0) << 16)) >> 8;
            uint256 fillerWantAssetIndex = (_values[1 + fillIndex * 2] & ~(~uint256(0) << 24)) >> 16;

            require(
                // offer.offerAssetId == fill.wantAssetId
                _addresses[makerOfferAssetIndex * 2 + 1] == _addresses[fillerWantAssetIndex * 2 + 1],
                "Invalid match"
            );

            require(
                // offer.wantAssetId == fill.offerAssetId
                _addresses[makerWantAssetIndex * 2 + 1] == _addresses[fillerOfferAssetIndex * 2 + 1],
                "Invalid match"
            );

            uint256 takeAmount = _values[i] >> 16;
            require(takeAmount > 0, "Invalid takeAmount");

            uint256 offerDataB = _values[2 + offerIndex * 2];
            // (offer.wantAmount * takeAmount) % offer.offerAmount == 0
            // this is to ensure that there would be no unfair trades
            // caused by rounding issues
            require(
                (offerDataB >> 128).mul(takeAmount).mod(offerDataB & ~(~uint256(0) << 128)) == 0,
                "Invalid amounts"
            );
        }
    }

    // validate that all fills will be completely filled by the specified matches
    function _validateFillAmounts(uint256[] memory _values) private pure {
        // "filled" is used to store the sum of takeAmounts and giveAmounts
        // each amount is given an individual slot so that there would not be
        // overflow issues or vulnerabilities
        uint256[] memory filled = new uint256[](_values.length * 2);

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
            uint256 takeAmount = _values[i] >> 16;
            uint256 wantAmount = _values[2 + offerIndex * 2] >> 128;
            uint256 offerAmount = _values[2 + offerIndex * 2] & ~(~uint256(0) << 128);
            uint256 mappedFillIndex = (1 + fillIndex * 2) * 2;
            // giveAmount = takeAmount * wantAmount / offerAmount
            uint256 giveAmount = takeAmount.mul(wantAmount).div(offerAmount);

            filled[mappedFillIndex] = filled[mappedFillIndex].add(giveAmount);
            filled[mappedFillIndex + 1] = filled[mappedFillIndex + 1].add(takeAmount);
        }

        // 1 + numOffers * 2
        i = 1 + (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i + numFills * 2
        end = i + ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        // loop fills
        for(i; i < end; i += 2) {
            require(
                // fill.offerAmount == (sum of given amounts for fill)
                _values[i + 1] & ~(~uint256(0) << 128) == filled[i * 2] &&
                // fill.wantAmount == (sum of taken amounts for fill)
                _values[i + 1] >> 128 == filled[i * 2 + 1],
                "Invalid fills"
            );
        }
    }

    function _validateTradeData(
        uint256[] memory _values,
        address[] memory _addresses,
        address _operator
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

            // offerAssetId != wantAssetId
            require(
                _addresses[((dataA & ~(~uint256(0) << 16)) >> 8) * 2 + 1] !=
                _addresses[((dataA & ~(~uint256(0) << 24)) >> 16) * 2 + 1],
                "Invalid trade assets"
            );

            // offerAmount > 0 && wantAmount > 0
            require(
                (dataB & ~(~uint256(0) << 128)) > 0 && (dataB >> 128) > 0,
                "Invalid amounts"
            );

            require(
                _addresses[((dataA & ~(~uint256(0) << 40)) >> 32) * 2] == _operator,
                "Invalid operator"
            );
        }
    }

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
                _addresses[(dataA & ~(~uint256(0) << 8)) * 2],
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
                _addresses[(dataA & ~(~uint256(0) << 8)) * 2],
                uint8((dataA & ~(~uint256(0) << 48)) >> 40),
                _hashes[_i * 2],
                _hashes[_i * 2 + 1],
                prefixedSignature
            );

            if (hashKeys.length > 0) { hashKeys[_i] = hashKey; }
        }

        return hashKeys;
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
}
