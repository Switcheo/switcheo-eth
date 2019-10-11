const { getBroker, getTokenList, getZeus, validateBalance,
        validateExternalBalance, assertReversion, testEvents } = require('../utils')
const { REASON_CODES } = require('../constants')

contract('Test tokensReceived', async (accounts) => {
    let broker, tokenList, zeus
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
        tokenList = await getTokenList()
        zeus = await getZeus(accounts[0])

        await zeus.mint(user, 87)
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            await tokenList.whitelistToken(zeus.address)
            const result = await zeus.send(broker.address, 87, '0x0', { from: user })
            testEvents(result, [
                'Sent',
                {
                    operator: user,
                    from: user,
                    to: broker.address,
                    amount: 87,
                    data: '0x00',
                    operatorData: null
                },
                'Transfer',
                {
                    from: user,
                    to: broker.address,
                    value: 87
                },
                'BalanceIncrease',
                {
                    user,
                    assetId: zeus.address,
                    amount: 87,
                    reason: REASON_CODES.REASON_DEPOSIT,
                    nonce: 0
                },
                'TokensReceived',
                {
                    user,
                    assetId: zeus.address,
                    amount: 87
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('deposits tokens', async () => {
            await validateExternalBalance(user, zeus, 87)
            await validateBalance(user, zeus, 0)

            await tokenList.whitelistToken(zeus.address)
            await zeus.send(broker.address, 87, '0x0', { from: user })

            await validateExternalBalance(user, zeus, 0)
            await validateBalance(user, zeus, 87)
        })
    })

    contract('when the token has not been whitelisted', async () => {
        it('raises an error', async () => {
            await validateExternalBalance(user, zeus, 87)
            await validateBalance(user, zeus, 0)

            await assertReversion(
                zeus.send(broker.address, 87, '0x0', { from: user }),
                'Invalid token'
            )

            await validateExternalBalance(user, zeus, 87)
            await validateBalance(user, zeus, 0)
        })
    })
})
