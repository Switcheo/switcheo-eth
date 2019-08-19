const { web3, getBroker, getJrc, getSwc, validateBalance, hashOffer,
        exchange, printLogs, assertAsync } = require('../utils')
const { getTradeParams } = require('../utils/getTradeParams')

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
})
