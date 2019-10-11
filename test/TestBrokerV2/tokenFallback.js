const { getBroker, getTokenList, getDgtx, validateBalance,
        validateExternalBalance, assertReversion, testEvents } = require('../utils')
const { REASON_CODES } = require('../constants')

contract('Test tokenFallback', async (accounts) => {
    let broker, tokenList, dgtx
    const owner = accounts[0]
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
        tokenList = await getTokenList()
        dgtx = await getDgtx()

        await dgtx.transfer(user, 87, { from: owner })
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            await tokenList.whitelistToken(dgtx.address)
            const result = await dgtx.transfer(broker.address, 87, { from: user })
            testEvents(result, [
                'Transfer',
                {
                    from: user,
                    to: broker.address,
                    value: 87
                },
                'BalanceIncrease',
                {
                    user,
                    assetId: dgtx.address,
                    amount: 87,
                    reason: REASON_CODES.REASON_DEPOSIT,
                    nonce: 0
                },
                'TokenFallback',
                {
                    user,
                    assetId: dgtx.address,
                    amount: 87
                },
                'Transfer',
                {
                    from: user,
                    to: broker.address,
                    value: 87,
                    // bytes(0)
                    data: '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('deposits tokens', async () => {
            await validateExternalBalance(user, dgtx, 87)
            await validateBalance(user, dgtx, 0)

            await tokenList.whitelistToken(dgtx.address)
            await dgtx.transfer(broker.address, 87, { from: user })

            await validateExternalBalance(user, dgtx, 0)
            await validateBalance(user, dgtx, 87)
        })
    })

    contract('when the token has not been whitelisted', async () => {
        it('raises an error', async () => {
            await validateExternalBalance(user, dgtx, 87)
            await validateBalance(user, dgtx, 0)

            await assertReversion(
                dgtx.transfer(broker.address, 87, { from: user }),
                'Invalid token'
            )

            await validateExternalBalance(user, dgtx, 87)
            await validateBalance(user, dgtx, 0)
        })
    })
})
