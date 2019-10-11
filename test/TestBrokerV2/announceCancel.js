const { getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange,
        assertAsync, testEvents, getEvmTime } = require('../utils')
const { getTradeParams } = require('../utils/getTradeParams')
const { MAX_SLOW_CANCEL_DELAY } = require('../constants')

const { PRIVATE_KEYS } = require('../wallets')

contract('Test slowCancel', async (accounts) => {
    let broker, jrc, swc, tradeParams
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS
    const announceDelay = MAX_SLOW_CANCEL_DELAY

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()

        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

        tradeParams = await getTradeParams(accounts)
        await exchange.trade(tradeParams, { privateKeys })
        await validateBalance(maker, jrc, 300) // 500 jrc - 100 jrc - 100 jrc
        await validateBalance(operator, jrc, 6) // received 3 jrc + 3 jrc
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)
            const result = await exchange.announceCancel(offer, { from: maker })

            const cancellableAt = (await getEvmTime()) + announceDelay
            testEvents(result, [
                'AnnounceCancel',
                {
                    offerHash,
                    cancellableAt
                }
            ])
        })
    })
})
