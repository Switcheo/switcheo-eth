const { web3, getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange, printLogs } = require('../utils')
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
    })

    contract('when parameters are valid', async () => {
        it('cancels the offer', async () => {
            const offer = tradeParams.offers[0]
            const offerHash = hashOffer(offer)
            const result = await exchange.cancel({ ...offer, cancelFeeAssetId: jrc.address, cancelFeeAmount: 2 }, { privateKey })
            printLogs(result, ['Log'])
        })
    })
})
