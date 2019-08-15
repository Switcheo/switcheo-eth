const { web3, getBroker, getJrc, getSwc, bn, shl, clone, validateBalance, hashMake,
        exchange, assertAsync, assertReversion, testValidation } = require('../../utils')
const { getTradeParams } = require('../../utils/getTradeParams')

const { PRIVATE_KEYS } = require('../../wallets')
const { ZERO_ADDR, ETHER_ADDR } = require('../../constants')

contract('Test trade: batch', async (accounts) => {
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

    contract('when parameters are valid', async () => {
        it('updates balances, nonces and offers', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            const tradeParams = await getTradeParams(accounts)
            const makeHash1 = hashMake(tradeParams.makes[0])
            const makeHash2 = hashMake(tradeParams.makes[1])

            await validateBalance(maker, jrc, 500)
            await validateBalance(maker, swc, 0)
            await validateBalance(filler, jrc, 0)
            await validateBalance(filler, swc, 300)
            await validateBalance(operator, jrc, 0)
            await validateBalance(operator, swc, 0)

            await assertAsync(broker.usedNonces(0), shl(1, 1).or(shl(1, 2)))

            await exchange.trade(tradeParams, { privateKeys })

            await validateBalance(maker, jrc, 300) // 500 jrc - 100 jrc - 100 jrc
            await validateBalance(maker, swc, 40) // received 20 swc + 20 swc
            await validateBalance(filler, jrc, 74) // received 40 jrc + 40 jrc - 6 jrc
            await validateBalance(filler, swc, 260) // 300 swc - 20 swc - 20 swc
            await validateBalance(operator, jrc, 6) // received 3 jrc + 3 jrc
            await validateBalance(operator, swc, 0) // unchanged

            await assertAsync(
                broker.usedNonces(0),
                shl(1, 1).or(shl(1, 2))
                         .or(shl(1, 3))
                         .or(shl(1, 4))
                         .or(shl(1, 5))
                         .or(shl(1, 6))
            )

            await assertAsync(broker.offers(makeHash1), 60)
            await assertAsync(broker.offers(makeHash2), 60)
        })
    })
})
