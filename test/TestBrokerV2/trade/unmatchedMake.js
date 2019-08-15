const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation, printLogs } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')
const { ZERO_ADDR, ETHER_ADDR } = require('../../constants')

contract('Test trade: unmatched make', async (accounts) => {
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

    it('still updates offers with the make\'s available amount', async () => {
        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

        const makes = [{
            maker,
            offerAssetId: jrc.address,
            offerAmount: 100,
            wantAssetId: swc.address,
            wantAmount: 50,
            feeAssetId: swc.address,
            feeAmount: 7,
            nonce: 3
        }, {
            maker,
            offerAssetId: jrc.address,
            offerAmount: 100,
            wantAssetId: swc.address,
            wantAmount: 50,
            feeAssetId: swc.address,
            feeAmount: 7,
            nonce: 4
        }]

        const fills = [{
            filler,
            offerAssetId: swc.address,
            offerAmount: 20,
            wantAssetId: jrc.address,
            wantAmount: 40,
            feeAssetId: jrc.address,
            feeAmount: 3,
            nonce: 5
        }]

        const matches = [{ makeIndex: 0, fillIndex: 2, takeAmount: 40 }]
        await exchange.trade({ operator, makes, fills, matches }, { privateKeys })

        const makeHash1 = hashMake(makes[0])
        const makeHash2 = hashMake(makes[1])
        await assertAsync(broker.offers(makeHash1), 60) // 100 jrc - 40 jrc
        await assertAsync(broker.offers(makeHash2), 100)
    })
})
