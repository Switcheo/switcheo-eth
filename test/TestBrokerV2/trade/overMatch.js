const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test trade: over match', async (accounts) => {
    let jrc, swc
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        jrc = await getJrc()
        swc = await getSwc()

        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })
    })

    contract('when the amount taken from a make is more than the make.offerAmount', async () => {
        it('raises an error', async () => {
            const tradeParams = await getTradeParams(accounts)
            const editedTradeParams = clone(tradeParams)
            const fill = clone(editedTradeParams.fills[1])
            editedTradeParams.fills[1] = { ...fill, offerAmount: 60, wantAmount: 120 }
            editedTradeParams.matches[1].takeAmount = 120

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'subtraction overflow'
            )
        })
    })

    contract('when the amount taken from a fill is more than the fill.offerAmount', async () => {
        it('raises an error', async () => {
            const tradeParams = await getTradeParams(accounts)
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].takeAmount = 50

            await testValidation(exchange.trade, [],
                [editedTradeParams, { privateKeys }],
                [tradeParams, { privateKeys }],
                'Invalid fills'
            )
        })
    })
})
