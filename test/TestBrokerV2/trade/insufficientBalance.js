const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test insufficient trade balance', async (accounts) => {
    let jrc, swc
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        jrc = await getJrc()
        swc = await getSwc()
    })

    contract('when maker has insufficient balance', async () => {
        it('raises an error', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 20, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })
            const tradeParams = await getTradeParams(accounts)
            await assertReversion(exchange.trade(tradeParams, { privateKeys }), 'subtraction overflow')
        })
    })

    contract('when filler has insufficient balance', async () => {
        it('raises an error', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 10, nonce: 2 })
            const tradeParams = await getTradeParams(accounts)
            await assertReversion(exchange.trade(tradeParams, { privateKeys }), 'subtraction overflow')
        })
    })
})
