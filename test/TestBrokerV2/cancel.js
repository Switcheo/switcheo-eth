const { getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange,
        assertAsync, assertReversion, testEvents } = require('../utils')
const { getTradeParams } = require('../utils/getTradeParams')
const { REASON_CODES } = require('../constants')
const { PRIVATE_KEYS, getPrivateKey } = require('../wallets')

contract('Test cancel', async (accounts) => {
    let broker, jrc, swc, tradeParams
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS
    const privateKey = getPrivateKey(maker)

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
            const result = await exchange.cancel({
                ...offer,
                expectedAvailableAmount: 60,
                cancelFeeAssetId: jrc.address,
                cancelFeeAmount: 2
            }, { privateKey })

            testEvents(result, [
                'BalanceIncrease',
                {
                    user: maker,
                    assetId: jrc.address,
                    amount: 58, // 60 - 2
                    reason: REASON_CODES.REASON_CANCEL,
                    nonce: offer.nonce
                },
                'BalanceIncrease',
                {
                    user: operator,
                    assetId: jrc.address,
                    amount: 2,
                    reason: REASON_CODES.REASON_CANCEL_FEE_RECEIVE,
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

            const result = await exchange.cancel({
                ...offer,
                expectedAvailableAmount: 60,
                cancelFeeAssetId: jrc.address,
                cancelFeeAmount: 2
            }, { privateKey })
            console.log('gas used', result.receipt.gasUsed)

            await validateBalance(maker, jrc, 358) // 300 jrc + 60 jrc - 2 jrc
            await validateBalance(operator, jrc, 8) // 6 jrc + 2 jrc
            await assertAsync(broker.offers(offerHash), 0)
        })
    })

    contract('when the signature is invalid', async () => {
        it('raises an error', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            await assertReversion(
                exchange.cancel({
                    ...offer,
                    expectedAvailableAmount: 60,
                    cancelFeeAssetId: jrc.address,
                    cancelFeeAmount: 2
                }, { privateKey: getPrivateKey(operator) }),
                'Invalid signature'
            )
        })
    })

    contract('when the offer has already been cancelled', async () => {
        it('raises an error', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            await exchange.cancel({
                ...offer,
                expectedAvailableAmount: 60,
                cancelFeeAssetId: jrc.address,
                cancelFeeAmount: 2
            }, { privateKey })

            await validateBalance(maker, jrc, 358) // 300 jrc + 60 jrc - 2 jrc
            await validateBalance(operator, jrc, 8) // 6 jrc + 2 jrc
            await assertAsync(broker.offers(offerHash), 0)

            await assertReversion(
                exchange.cancel({
                    ...offer,
                    expectedAvailableAmount: 60,
                    cancelFeeAssetId: jrc.address,
                    cancelFeeAmount: 2
                }, { privateKey }),
                '32'
            )
        })
    })

    contract('when the available amount does not match the expected available amount', async () => {
        it('raises an error', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 60)

            await assertReversion(
                exchange.cancel({
                    ...offer,
                    expectedAvailableAmount: 50,
                    cancelFeeAssetId: jrc.address,
                    cancelFeeAmount: 2
                }, { privateKey }),
                '33'
            )
        })
    })
})
