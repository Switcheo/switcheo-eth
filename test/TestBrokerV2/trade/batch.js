const { getBroker, getJrc, getSwc, shl, validateBalance, hashOffer,
        exchange, assertAsync, testTradeEvents, testEvents } = require('../../utils')

const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test trade: batch', async (accounts) => {
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

    contract('test event emission', async () => {
        it('emits events', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            const tradeParams = await getTradeParams(accounts)
            const result = await exchange.trade(tradeParams, { privateKeys })

            testTradeEvents(result, {
                nonces: [3, 4, 5, 6],
                increments: [
                    [maker, swc.address, 40].join(','),
                    [filler, jrc.address, 74].join(','),
                    [operator, jrc.address, 6].join(',')
                ],
                decrements: [
                    [maker, jrc.address, 200].join(','),
                    [filler, swc.address, 40].join(',')
                ],
                dynamicIncrements: []
            })

            testEvents(result, [
                'Trade',
                {
                    maker,
                    taker: filler,
                    makerGiveAsset: jrc.address,
                    makerGiveAmount: 40,
                    fillerGiveAsset: swc.address,
                    fillerGiveAmount: 20
                },
                'Trade',
                {
                    maker,
                    taker: filler,
                    makerGiveAsset: jrc.address,
                    makerGiveAmount: 40,
                    fillerGiveAsset: swc.address,
                    fillerGiveAmount: 20
                }
            ], { start: 0, end: 2 })
        })
    })

    contract('when parameters are valid', async () => {
        it('updates balances, nonces and offers', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            const tradeParams = await getTradeParams(accounts)
            const offerHash1 = hashOffer(tradeParams.offers[0])
            const offerHash2 = hashOffer(tradeParams.offers[1])

            await validateBalance(maker, jrc, 500)
            await validateBalance(maker, swc, 0)
            await validateBalance(filler, jrc, 0)
            await validateBalance(filler, swc, 300)
            await validateBalance(operator, jrc, 0)
            await validateBalance(operator, swc, 0)

            await assertAsync(broker.usedNonces(0), shl(1, 1).or(shl(1, 2)))

            await exchange.trade(tradeParams, { privateKeys })

            await validateBalance(maker, jrc, 300) // 500 jrc - 100 jrc - 100 jrc
            await validateBalance(maker, swc, 40) // received 20 swc + 20 swc
            await validateBalance(filler, jrc, 74) // received 40 jrc + 40 jrc - 6 jrc
            await validateBalance(filler, swc, 260) // 300 swc - 20 swc - 20 swc
            await validateBalance(operator, jrc, 6) // received 3 jrc + 3 jrc
            await validateBalance(operator, swc, 0) // unchanged

            await assertAsync(
                broker.usedNonces(0),
                shl(1, 1).or(shl(1, 2))
                         .or(shl(1, 3))
                         .or(shl(1, 4))
                         .or(shl(1, 5))
                         .or(shl(1, 6))
            )

            await assertAsync(broker.offers(offerHash1), 60)
            await assertAsync(broker.offers(offerHash2), 60)
        })
    })
})
