const { getJrc, getSwc, validateBalance, exchange } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test trade: fees', async (accounts) => {
    let jrc, swc
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        jrc = await getJrc()
        swc = await getSwc()

        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })
    })

    contract('when fill.feeAssetId == fill.wantAssetId', async () => {
        it('deducts the fee amount from the filler\'s received amount', async () => {
            const tradeParams = await getTradeParams(accounts)
            await exchange.trade(tradeParams, { privateKeys })
            await validateBalance(filler, jrc, 74) // received 40 jrc + 40 jrc - 6 jrc
            await validateBalance(filler, swc, 260) // 300 swc - 20 swc - 20 swc
            await validateBalance(operator, jrc, 6) // received 3 jrc + 3 jrc
        })
    })

    contract('when fill.feeAssetId != fill.wantAssetId', async () => {
        it('deducts the fee amount from the filler\'s available balance', async () => {
            const tradeParams = await getTradeParams(accounts)
            tradeParams.fills[1].feeAssetId = swc.address
            await exchange.trade(tradeParams, { privateKeys })

            await validateBalance(filler, jrc, 77) // received 40 jrc + 40 jrc - 3 jrc
            await validateBalance(filler, swc, 257) // 300 swc - 20 swc - 20 swc - 3 swc
            await validateBalance(operator, jrc, 3) // received 3 jrc
            await validateBalance(operator, swc, 3) // received 3 swc
        })
    })

    contract('when offer.feeAssetId == offer.wantAssetId', async () => {
        it('deducts the fee amount from the maker\'s received amount', async () => {
            const tradeParams = await getTradeParams(accounts)
            tradeParams.offers[1].feeAmount = 7
            await exchange.trade(tradeParams, { privateKeys })
            await validateBalance(maker, jrc, 300) // 500 jrc - 100 jrc - 100 jrc
            await validateBalance(maker, swc, 33) // received 20 swc + 20 swc
            await validateBalance(operator, jrc, 6) // received 3 jrc + 3 jrc
            await validateBalance(operator, swc, 7) // received 7 swc
        })
    })

    contract('when offer.feeAssetId != offer.wantAssetId', async () => {
        it('deducts the fee amount from the maker\'s available balance', async () => {
            const tradeParams = await getTradeParams(accounts)
            tradeParams.offers[1].feeAssetId = jrc.address
            tradeParams.offers[1].feeAmount = 7
            await exchange.trade(tradeParams, { privateKeys })
            await validateBalance(maker, jrc, 293) // 500 jrc - 100 jrc - 100 jrc
            await validateBalance(maker, swc, 40) // received 20 swc + 20 swc
            await validateBalance(operator, jrc, 13) // received 3 jrc + 3 jrc + 7 jrc
        })
    })
})
