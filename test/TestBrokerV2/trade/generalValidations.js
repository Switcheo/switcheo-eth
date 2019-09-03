const { getBroker, getJrc, getSwc, bn, shl, clone, exchange, testValidation } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')
const { ZERO_ADDR, ETHER_ADDR } = require('../../constants')

contract('Test trade: general validations', async (accounts) => {
    let broker, jrc, swc, tradeParams
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()

        await broker.deposit({ from: maker, value: 1000 })
        await broker.deposit({ from: filler, value: 1000 })
        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

        tradeParams = await getTradeParams(accounts)
    })

    contract('when numOffers is 0', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values }) => { values[0] = bn(0).or(shl(2, 8)).or(shl(2, 16)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                '47'
            )
        })
    })

    contract('when numFills is 0', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values }) => { values[0] = bn(2).or(shl(0, 8)).or(shl(2, 16)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                '47'
            )
        })
    })

    contract('when numMatches is 0', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(0, 16)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                '47'
            )
        })
    })

    contract('when _values.length does not match number of offers and fills', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values }) => { values.push(1) },
                () => { /* no op */ },
                '48'
            )
        })
    })

    contract('when _hashes.length does not match number of offers and fills', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ hashes }) => { hashes.push(ZERO_ADDR) },
                () => { /* no op */ },
                '49'
            )
        })
    })

    contract('when offers are not unique', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[0].nonce = 4

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '50'
            )
        })
    })

    contract('when offer nonces are not sorted in ascending order', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[0].nonce = 20

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '50'
            )
        })
    })

    contract('when a match.offerIndex >= numOffers', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].offerIndex = 2

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '51'
            )
        })
    })

    contract('when a match.fillIndex is < numOffers', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].fillIndex = 1

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '52'
            )
        })
    })

    contract('when a match.fillIndex is >= (numOffers + numFills)', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].fillIndex = 4

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '52'
            )
        })
    })

    contract('when offer.offerAssetId != fill.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].offerAssetId = ETHER_ADDR

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '53'
            )
        })
    })

    contract('when offer.wantAssetId != fill.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].wantAssetId = ETHER_ADDR

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '54'
            )
        })
    })

    contract('when a match has non-zero bits in bits(16..128)', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].takeAmount = 0

            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values }) => {
                    values[values.length - 1] = values[values.length - 1].or(shl(1, 16))
                },
                [],
                '55'
            )
        })
    })

    contract('when match.takeAmount is 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].takeAmount = 0

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '56'
            )
        })
    })

    contract('when (offer.wantAmount * takeAmount) % offer.offerAmount != 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].wantAmount = 33

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '57'
            )
        })
    })

    contract('when fills are not fully filled', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].takeAmount = 20

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '58'
            )
        })
    })

    contract('when offer signatures are not valid', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ hashes }) => { hashes[3] = ZERO_ADDR }, [],
                '44'
            )
        })
    })

    contract('when fill signatures are not valid', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ hashes }) => { hashes[7] = ZERO_ADDR }, [],
                '44'
            )
        })
    })

    contract('when offer.offerAssetId == offer.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].wantAssetId = jrc.address
            editedTradeParams.fills[1].offerAssetId = jrc.address

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '59'
            )
        })
    })

    contract('when a offer.offerAmount is 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            const offer = clone(editedTradeParams.offers[0])
            editedTradeParams.offers.push({ ...offer, offerAmount: 0, nonce: 20 })
            editedTradeParams.matches = [
                { offerIndex: 0, fillIndex: 3, takeAmount: 40 },
                { offerIndex: 1, fillIndex: 4, takeAmount: 40 }
            ]

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '60'
            )
        })
    })

    contract('when a offer.wantAmount is 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            const offer = clone(editedTradeParams.offers[0])
            editedTradeParams.offers.push({ ...offer, wantAmount: 0, nonce: 20 })
            editedTradeParams.matches = [
                { offerIndex: 0, fillIndex: 3, takeAmount: 40 },
                { offerIndex: 1, fillIndex: 4, takeAmount: 40 }
            ]

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '60'
            )
        })
    })

    contract('when the operator address is not set to address(0)', async () => {
       it('raises an error', async () => {
           await testValidation(exchange.trade, [tradeParams, { privateKeys }],
               ({ addresses }) => {
                   for (let i = 0; i < addresses.length; i += 2) {
                       if (addresses[i] == ZERO_ADDR) {
                           addresses[i] = operator
                           break
                       }
                   }
               },
               [],
               '61'
           )
       })
   })

    contract('when the operator\'s fee asset ID is not set to address(0)', async () => {
       it('raises an error', async () => {
           await testValidation(exchange.trade, [tradeParams, { privateKeys }],
               ({ addresses }) => {
                   for (let i = 0; i < addresses.length; i += 2) {
                       if (addresses[i] == ZERO_ADDR) {
                           addresses[i + 1] = jrc.address
                           break
                       }
                   }
               },
               [],
               '62'
           )
       })
   })

    contract('when an offer.nonce is already used', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[0].nonce = 1

            // nonce 1 has already been used by a deposit transaction
            // so the nonce will be found to be taken and the contract will
            // use offers[offerHash] as the availableAmount
            // this will be 0, causing an error to be thrown
            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '37'
            )
        })
    })

    contract('when an offer.nonce is the same as a fill.nonce', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].nonce = editedTradeParams.fills[0].nonce
            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '42'
            )
        })
    })

    contract('when fill nonces are not unique', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.fills[0].nonce = 6

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                '42'
            )
        })
    })
})
