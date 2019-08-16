const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation } = require('../../utils')
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

    contract('when lengths input does not match expected format', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values, fill }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)).or(shl(1, 27)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                'Invalid lengths input'
            )
        })
    })

    contract('when numMakes is 0', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values, fill }) => { values[0] = bn(0).or(shl(2, 8)).or(shl(2, 16)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                'Invalid trade inputs'
            )
        })
    })

    contract('when numFills is 0', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values, fill }) => { values[0] = bn(2).or(shl(0, 8)).or(shl(2, 16)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                'Invalid trade inputs'
            )
        })
    })

    contract('when numMatches is 0', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values, fill }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(0, 16)) },
                ({ values }) => { values[0] = bn(2).or(shl(2, 8)).or(shl(2, 16)) },
                'Invalid trade inputs'
            )
        })
    })

    contract('when _values.length does not match number of makes and fills', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ values }) => { values.push(1) },
                () => { /* no op */ },
                'Invalid _values.length'
            )
        })
    })

    contract('when _hashes.length does not match number of makes and fills', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ hashes }) => { hashes.push(ZERO_ADDR) },
                () => { /* no op */ },
                'Invalid _hashes.length'
            )
        })
    })

    contract('when makes are not unique', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[0].nonce = 4

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid make nonces'
            )
        })
    })

    contract('when make nonces are not sorted in ascending order', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[0].nonce = 20

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid make nonces'
            )
        })
    })

    contract('when make.offerAssetId == make.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[1].wantAssetId = jrc.address

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid make'
            )
        })
    })

    contract('when a match.makeIndex >= numMakes', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].makeIndex = 2

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid makeIndex'
            )
        })
    })

    contract('when a match.fillIndex is < numMakes', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].fillIndex = 1

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid fillIndex'
            )
        })
    })

    contract('when a match.fillIndex is >= (numMakes + numFills)', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].fillIndex = 4

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid fillIndex'
            )
        })
    })

    contract('when fill.offerAssetId == fill.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.fills[1].offerAssetId = jrc.address

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid fill'
            )
        })
    })

    contract('when make.offerAssetId != fill.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[1].offerAssetId = ETHER_ADDR

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid match'
            )
        })
    })

    contract('when make.wantAssetId != fill.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[1].wantAssetId = ETHER_ADDR

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid match'
            )
        })
    })

    contract('when (make.wantAmount * takeAmount) % make.offerAmount != 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[1].wantAmount = 33

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid amounts'
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
                'Invalid fills'
            )
        })
    })

    contract('when make signatures are not valid', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ hashes }) => { hashes[3] = ZERO_ADDR }, [],
                'Invalid signature'
            )
        })
    })

    contract('when fill signatures are not valid', async () => {
        it('raises an error', async () => {
            await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                ({ hashes }) => { hashes[7] = ZERO_ADDR }, [],
                'Invalid signature'
            )
        })
    })

    contract('when a make.offerAmount is 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            const make = clone(editedTradeParams.makes[0])
            editedTradeParams.makes.push({ ...make, offerAmount: 0, nonce: 20 })
            editedTradeParams.matches = [
                { makeIndex: 0, fillIndex: 3, takeAmount: 40 },
                { makeIndex: 1, fillIndex: 4, takeAmount: 40 }
            ]

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid amounts'
            )
        })
    })

    contract('when a make.wantAmount is 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            const make = clone(editedTradeParams.makes[0])
            editedTradeParams.makes.push({ ...make, wantAmount: 0, nonce: 20 })
            editedTradeParams.matches = [
                { makeIndex: 0, fillIndex: 3, takeAmount: 40 },
                { makeIndex: 1, fillIndex: 4, takeAmount: 40 }
            ]

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid amounts'
            )
        })
    })

    contract('when the operator address is invalid', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.operator = maker

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid operator'
            )
        })
    })

    contract('when a make.nonce is already used', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[0].nonce = 1

            // nonce 1 has already been used by a deposit transaction
            // so the nonce will be found to be taken and the contract will
            // use offers[makeHash] as the availableAmount
            // this will be 0, causing an error to be thrown
            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid availableAmount'
            )
        })
    })

    contract('when a make.nonce is the same as a fill.nonce', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.makes[1].nonce = editedTradeParams.fills[0].nonce
            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Nonce already used'
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
                'Nonce already used'
            )
        })
    })
})
