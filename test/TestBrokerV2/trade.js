const { web3, getBroker, getJrc, getSwc, bn, shl, validateBalance, hashMake,
        exchange, assertAsync, testValidation } = require('../utils')
const { PRIVATE_KEYS } = require('../wallets')
const { ZERO_ADDR } = require('../constants')

async function touchBalances(accounts) {
    const jrc = await getJrc()
    const swc = await getSwc()

    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]

    await exchange.mintAndDeposit({ user: operator, token: jrc, amount: 1, nonce: 3 })
    await exchange.mintAndDeposit({ user: operator, token: swc, amount: 1, nonce: 4 })

    await exchange.mintAndDeposit({ user: maker, token: swc, amount: 1, nonce: 5 })
    await exchange.mintAndDeposit({ user: filler, token: jrc, amount: 1, nonce: 6 })
}

async function batchTrade(batchSize, accounts) {
    const privateKeys = PRIVATE_KEYS

    const jrc = await getJrc()
    const swc = await getSwc()

    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]

    await exchange.mintAndDeposit({ user: maker, token: jrc, amount: batchSize * 2 * 100, nonce: 1 })
    await exchange.mintAndDeposit({ user: filler, token: swc, amount: batchSize * 2 * 50, nonce: 2 })

    const makes = []
    const fills = []
    const matches = []

    for (let i = 0; i < batchSize; i++) {
        makes.push(
            {
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 10 + batchSize * 2 + i
            }
        )
        fills.push({
            filler,
            offerAssetId: swc.address,
            offerAmount: 50,
            wantAssetId: jrc.address,
            wantAmount: 100,
            feeAssetId: jrc.address,
            feeAmount: 7,
            nonce: 10 + batchSize * 4 + i
        })
        matches.push({
            makeIndex: i,
            fillIndex: batchSize + i,
            takeAmount: 100
        })
    }

    const result = await exchange.trade({
        operator,
        makes,
        fills,
        matches
    }, { privateKeys })

    // console.log('gas used', result.receipt.gasUsed)
    console.log('gas used', result.receipt.gasUsed / batchSize)
}

contract('Test trade', async (accounts) => {
    let broker, jrc, swc
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()
    })

    contract('test nonce uniqueness validation', async () => {
        let makes, fills, matches, tradeParams

        beforeEach(async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            makes = [{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 3
            },{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 4
            }]

            fills = [{
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 5
            }, {
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 6
            }]

            matches = [{
                makeIndex: 0,
                fillIndex: 2,
                takeAmount: 40
            }, {
                makeIndex: 1,
                fillIndex: 3,
                takeAmount: 40
            }]

            tradeParams = { operator, makes, fills, matches }
        })

        contract('when make nonces are not unique', async () => {
            it('raises an error', async () => {
                const editedMakes = [...makes]
                editedMakes[0] = { ...makes[0] }
                editedMakes[0].nonce = 4

                await testValidation(exchange.trade, [],
                    [{ operator, makes: editedMakes, fills, matches }, { privateKeys }],
                    [tradeParams, { privateKeys }]
                )
            })
        })
    })

    contract('test single trade validations', async () => {
        let make, fill, matches, tradeParams

        beforeEach(async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 170, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 30, nonce: 2 })

            make = {
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 3
            }
            fill = {
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 4
            }
            matches = [{
                makeIndex: 0,
                fillIndex: 1,
                takeAmount: 40
            }]

            tradeParams = { operator, makes: [make], fills: [fill], matches }
        })

        contract('when numMakes is 0', async () => {
            it('raises an error', async () => {
                await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                    ({ values, fill }) => { values[0] = bn(0).or(shl(1, 8)).or(shl(1, 16)) },
                    ({ values }) => { values[0] = bn(1).or(shl(1, 8)).or(shl(1, 16)) }
                )
            })
        })

        contract('when numFills is 0', async () => {
            it('raises an error', async () => {
                await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                    ({ values }) => { values[0] = bn(1).or(shl(0, 8)).or(shl(1, 16)) },
                    ({ values }) => { values[0] = bn(1).or(shl(1, 8)).or(shl(1, 16)) }
                )
            })
        })

        contract('when numMatches is 0', async () => {
            it('raises an error', async () => {
                await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                    ({ values }) => { values[0] = bn(1).or(shl(1, 8)).or(shl(0, 16)) },
                    ({ values }) => { values[0] = bn(1).or(shl(1, 8)).or(shl(1, 16)) }
                )
            })
        })

        contract('when _values.length does not match number of makes and fills', async () => {
            it('raises an error', async () => {
                await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                    ({ values }) => { values.push(1) },
                    () => { /* no op */ }
                )
            })
        })

        contract('when _hashes.length does not match number of makes and fills', async () => {
            it('raises an error', async () => {
                await testValidation(exchange.trade, [tradeParams, { privateKeys }],
                    ({ hashes }) => { hashes.push(ZERO_ADDR) },
                    () => { /* no op */ }
                )
            })
        })
    })

    contract('gas cost test: worst-case single trade', async () => {
        it('prints gas cost', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 170, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 30, nonce: 2 })
            await assertAsync(broker.usedNonces(0), shl(1, 1).or(shl(1, 2)))

            const make = {
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 3
            }
            const fill = {
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 4
            }
            const matches = [{
                makeIndex: 0,
                fillIndex: 1,
                takeAmount: 40
            }]

            const makeHash = hashMake(make)
            await assertAsync(broker.offers(makeHash), 0)

            const result = await exchange.trade({
                operator,
                makes: [make],
                fills: [fill],
                matches
            }, { privateKeys })
            console.log('gas used', result.receipt.gasUsed)

            await validateBalance(maker, jrc, 70) // 170 jrc - 100 jrc used for making offer
            await validateBalance(maker, swc, 20) // received 20 swc from filler
            await validateBalance(filler, jrc, 37) // received 40 jrc - 3 jrc for fee
            await validateBalance(filler, swc, 10) // 30 swc - 20 swc used for fill
            await validateBalance(operator, jrc, 3) // received 3 jrc for fee
            await validateBalance(operator, swc, 0) // unchanged

            // assert that remaining available offer amount is stored
            await assertAsync(broker.offers(makeHash), 60) // 60 jrc remaining, 100 jrc - 40 jrc
            // assert that all nonces have been marked as used
            await assertAsync(broker.usedNonces(0), shl(1, 1).or(shl(1, 2)).or(shl(1, 3)).or(shl(1, 4)))
        })
    })

    contract('gas cost test: sample single trade', async () => {
        it('prints gas cost', async () => {
            await batchTrade(1, accounts)
        })
    })

    contract('gas cost test: best-case single trade', async () => {
        it('prints gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(1, accounts)
        })
    })

    contract('gas cost test: best-case optimised batched trades (5 trades)', async () => {
        it('prints gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(5, accounts)
        })
    })

    contract('gas cost test: best-case optimised batched trades (10 trades)', async () => {
        it('prints gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(10, accounts)
        })
    })
})
