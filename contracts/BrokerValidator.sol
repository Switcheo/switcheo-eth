pragma solidity 0.5.10;

import "./lib/math/SafeMath.sol";

contract BrokerValidator {
    using SafeMath for uint256;

    function validateTrades(
        uint256[] calldata _values,
        bytes32[] calldata _hashes,
        address[] calldata _addresses,
        address _operator
    )
        external
        pure
    {
        _validateTradeInputLengths(_values, _hashes);
        _validateUniqueMakes(_values);
        _validateMatches(_values, _addresses);
        _validateFillAmounts(_values);
        _validateTradeData(_values, _addresses, _operator);
    }

    function _validateTradeInputLengths(
        uint256[] memory _values,
        bytes32[] memory _hashes
    )
        private
        pure
    {
        uint256 numMakes = _values[0] & ~(~uint256(0) << 8);
        uint256 numFills = (_values[0] & ~(~uint256(0) << 16)) >> 8;
        uint256 numMatches = (_values[0] & ~(~uint256(0) << 24)) >> 16;

        // it is enforced by other checks that if a fill is present
        // then it must be completely filled so there must be at least one make
        // and at least one match in this case
        // it is possible to have one make with no matches and no fills
        // but that is blocked by this check as there is no foreseeable use case for it
        require(
            numMakes > 0 && numFills > 0 && numMatches > 0,
            "Invalid trade inputs"
        );

        // the format of _values is:
        // _values[0]: stores the number of makes, fills and matches
        // followed by "numMakes * 2" slots for make data with each make taking up two slots
        // followed by "numFills * 2" slots for fill data with each fill taking up two slots
        // followed by "numMatches" slots for match data with each match taking up one slot
        require(
            _values.length == 1 + numMakes * 2 + numFills * 2 + numMatches,
            "Invalid _values.length"
        );

        // the format of _hashes is:
        // "numMakes * 2" slots for r and s signature values, with each make having one r and one s value
        // "numFills * 2" slots for r and s signature values, with each fill having one r and one s value
        require(
            _hashes.length == (numMakes + numFills) * 2,
            "Invalid _hashes.length"
        );
    }

    // make uniqueness must be enforced because it would otherwise be possible
    // to repeat a make within the makes list and cause repeated deductions
    //
    // this is because make deductions will occur if the make's nonce has not
    // yet been taken, and for new makes, nonces are only marked as taken
    // at the end of the trade function
    //
    // uniqueness of makes are validated in O(N) time by requiring that
    // make nonces are in a strictly ascending order
    function _validateUniqueMakes(uint256[] memory _values) private pure {
        uint256 start = 1;
        uint256 numMakes = _values[0] & ~(~uint256(0) << 8);
        uint256 end = start + numMakes * 2;

        uint256 prevNonce;
        uint256 mask = ~(~uint256(0) << 128);

        for(uint256 i = start; i < end; i += 2) {
            uint256 nonce = (_values[i] & mask) >> 48;

            if (i == start) {
                prevNonce = nonce;
                continue;
            }

            require(nonce > prevNonce, "Invalid make nonces");
            prevNonce = nonce;
        }
    }

    // validate that for every match:
    // 1. makeIndexes fall within the range of makes
    // 2. fillIndexes falls within the range of fills
    // 3. make.offerAssetId == fill.wantAssetId
    // 4. make.wantAssetId == fill.offerAssetId
    // 5. takeAmount > 0
    // 6. (make.wantAmount * takeAmount) % make.offerAmount == 0
    function _validateMatches(
        uint256[] memory _values,
        address[] memory _addresses
    )
        private
        pure
    {
        uint256 i = 1;
        // i += numMakes * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        uint256 numMakes = _values[0] & ~(~uint256(0) << 8);
        uint256 numFills = (_values[0] & ~(~uint256(0) << 16)) >> 8;

        // loop matches
        for (i; i < end; i++) {
            uint256 makeIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 fillIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;

            require(
                makeIndex < numMakes,
                "Invalid makeIndex"
            );

            require(
                fillIndex >= numMakes && fillIndex < numMakes + numFills,
                "Invalid fillIndex"
            );

            uint256 makerOfferAssetIndex = (_values[1 + makeIndex * 2] & ~(~uint256(0) << 16)) >> 8;
            uint256 makerWantAssetIndex = (_values[1 + makeIndex * 2] & ~(~uint256(0) << 24)) >> 16;
            uint256 fillerOfferAssetIndex = (_values[1 + fillIndex * 2] & ~(~uint256(0) << 16)) >> 8;
            uint256 fillerWantAssetIndex = (_values[1 + fillIndex * 2] & ~(~uint256(0) << 24)) >> 16;

            require(
                // make.offerAssetId == fill.wantAssetId
                _addresses[makerOfferAssetIndex * 2 + 1] == _addresses[fillerWantAssetIndex * 2 + 1],
                "Invalid match"
            );

            require(
                // make.wantAssetId == fill.offerAssetId
                _addresses[makerWantAssetIndex * 2 + 1] == _addresses[fillerOfferAssetIndex * 2 + 1],
                "Invalid match"
            );

            uint256 takeAmount = _values[i] >> 16;
            require(takeAmount > 0, "Invalid takeAmount");

            uint256 makeDataB = _values[2 + makeIndex * 2];
            // (make.wantAmount * takeAmount) % make.offerAmount == 0
            // this is to ensure that there would be no unfair trades
            // caused by rounding issues
            require(
                (makeDataB >> 128).mul(takeAmount).mod(makeDataB & ~(~uint256(0) << 128)) == 0,
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
        // i += numMakes * 2
        i += (_values[0] & ~(~uint256(0) << 8)) * 2;
        // i += numFills * 2
        i += ((_values[0] & ~(~uint256(0) << 16)) >> 8) * 2;

        uint256 end = _values.length;

        // loop matches
        for (i; i < end; i++) {
            uint256 makeIndex = _values[i] & ~(~uint256(0) << 8);
            uint256 fillIndex = (_values[i] & ~(~uint256(0) << 16)) >> 8;
            uint256 takeAmount = _values[i] >> 16;
            uint256 wantAmount = _values[2 + makeIndex * 2] >> 128;
            uint256 offerAmount = _values[2 + makeIndex * 2] & ~(~uint256(0) << 128);
            uint256 mappedFillIndex = (1 + fillIndex * 2) * 2;
            // giveAmount = takeAmount * wantAmount / offerAmount
            uint256 giveAmount = takeAmount.mul(wantAmount).div(offerAmount);

            filled[mappedFillIndex] = filled[mappedFillIndex].add(giveAmount);
            filled[mappedFillIndex + 1] = filled[mappedFillIndex + 1].add(takeAmount);
        }

        // 1 + numMakes * 2
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
        // numMakes + numFills
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
}
