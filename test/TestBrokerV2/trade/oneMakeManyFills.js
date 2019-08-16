const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation, printLogs } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')
const { ZERO_ADDR, ETHER_ADDR } = require('../../constants')

contract('Test trade: one make many fills', async (accounts) => {
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

    it('correctly updates contract state', async () => {
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
        }]

        const fills = [{
            filler,
            offerAssetId: swc.address,
            offerAmount: 20,
            wantAssetId: jrc.address,
            wantAmount: 40,
            feeAssetId: jrc.address,
            feeAmount: 3,
            nonce: 4
        }, {
            filler,
            offerAssetId: swc.address,
            offerAmount: 10,
            wantAssetId: jrc.address,
            wantAmount: 20,
            feeAssetId: jrc.address,
            feeAmount: 2,
            nonce: 5
        }]

        const matches = [
            { makeIndex: 0, fillIndex: 1, takeAmount: 40 },
            { makeIndex: 0, fillIndex: 2, takeAmount: 20 }
        ]
        await exchange.trade({ operator, makes, fills, matches }, { privateKeys })

        await validateBalance(maker, jrc, 400) // 500 jrc - 100 jrc
        await validateBalance(maker, swc, 23) // 20 swc + 10 swc - 7 swc
        await validateBalance(filler, jrc, 55) // 60 jrc - 3 jrc - 2 jrc
        await validateBalance(filler, swc, 270) // 300 swc - 20 swc - 10 swc
        await validateBalance(operator, jrc, 5) // received 3 jrc +  2 jrc
        await validateBalance(operator, swc, 7) // received 7 swc

        const makeHash = hashMake(makes[0])
        await assertAsync(broker.offers(makeHash), 40) // 100 jrc - 40 jrc - 20 jrc
    })
})
