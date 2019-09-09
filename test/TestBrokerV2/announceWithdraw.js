const { getBroker, getJrc, validateBalance, validateExternalBalance,
        getEvmTime, exchange, testEvents } = require('../utils')
const { MAX_SLOW_WITHDRAW_DELAY } = require('../constants')

contract('Test announceWithdraw', async (accounts) => {
    let broker, jrc
    const user = accounts[1]
    const announceDelay = MAX_SLOW_WITHDRAW_DELAY

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        await jrc.mint(user, 42)
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)

            const result = await broker.announceWithdraw(jrc.address, 42, { from: user })
            const withdrawableAt = (await getEvmTime()) + announceDelay

            testEvents(result, [
                'AnnounceWithdraw',
                {
                    withdrawer: user,
                    assetId: jrc.address,
                    amount: 42,
                    withdrawableAt
                }
            ])
        })
    })
})
