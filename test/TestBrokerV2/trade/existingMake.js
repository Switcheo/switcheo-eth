const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')
const { ZERO_ADDR, ETHER_ADDR } = require('../../constants')

contract('Test trade: existing make', async (accounts) => {
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

    it('does not re-deduct make.offerAmount and make.feeAmount', async () => {
        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

        const makes = [{
            maker,
            offerAssetId: jrc.address,
            offerAmount: 100,
            wantAssetId: swc.address,
            wantAmount: 50,
            feeAssetId: swc.address,
            feeAmount: 3,
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
        }]

        const matches = [{ makeIndex: 0, fillIndex: 1, takeAmount: 40 }]

        await exchange.trade({ operator, makes, fills, matches }, { privateKeys })

        // await validateBalance(maker, jrc, )
    })
})
