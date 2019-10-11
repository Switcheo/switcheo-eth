const { getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange,
        assertAsync, testEvents } = require('../utils')
const { getTradeParams } = require('../utils/getTradeParams')
const { REASON_CODES } = require('../constants')
const { PRIVATE_KEYS } = require('../wallets')

contract('Test adminCancel', async (accounts) => {
    let broker, jrc, swc, tradeParams
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

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
            await broker.setAdminState(1)
            const result = await exchange.adminCancel({
                ...offer,
                expectedAvailableAmount: 60
            })

            testEvents(result, [
                'BalanceIncrease',
                {
                    user: maker,
                    assetId: jrc.address,
                    amount: 60,
                    reason: REASON_CODES.REASON_CANCEL,
                    nonce: offer.nonce
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('cancels the offer', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            await broker.setAdminState(1)
            const result = await exchange.adminCancel({
                ...offer,
                expectedAvailableAmount: 60
            })
            console.log('gas used', result.receipt.gasUsed)

            await validateBalance(maker, jrc, 360) // 300 jrc + 60 jrc
            await validateBalance(operator, jrc, 6) // unchanged
            await assertAsync(broker.offers(offerHash), 0)
        })
    })
})
