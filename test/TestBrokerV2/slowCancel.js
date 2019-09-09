const { getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange,
        assertAsync, increaseEvmTime, assertReversion } = require('../utils')
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

    contract('when parameters are valid', async () => {
        it('cancels the offer', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            const resultA = await exchange.announceCancel(offer, { from: maker })
            console.log('announceCancel gas used', resultA.receipt.gasUsed)

            await increaseEvmTime(announceDelay)

            const resultB = await exchange.slowCancel(offer)
            console.log('slowCancel gas used', resultB.receipt.gasUsed)

            await validateBalance(maker, jrc, 360) // 300 jrc + 60 jrc
            await validateBalance(operator, jrc, 6) // unchanged
            await assertAsync(broker.offers(offerHash), 0)
        })
    })

    contract('when the cancellation was not pre-announced', async () => {
        it('raises an error', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            await increaseEvmTime(announceDelay)

            await assertReversion(
                exchange.slowCancel(offer),
                '13'
            )
        })
    })

    contract('when the cancellation time has not passed', async () => {
        it('raises an error', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            await exchange.announceCancel(offer, { from: maker })
            await increaseEvmTime(announceDelay - 10)

            await assertReversion(
                exchange.slowCancel(offer),
                '14'
            )
        })
    })
})
