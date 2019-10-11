const { getBroker, getJrc, validateBalance, validateExternalBalance,
        increaseEvmTime, exchange, assertReversion, testEvents } = require('../utils')
const { MAX_SLOW_WITHDRAW_DELAY, REASON_CODES } = require('../constants')

contract('Test slowWithdraw', async (accounts) => {
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
            await broker.announceWithdraw(jrc.address, 42, { from: user })
            await increaseEvmTime(announceDelay)
            const result = await broker.slowWithdraw(user, jrc.address, 42, { from: user })

            testEvents(result, [
                'BalanceDecrease',
                {
                    user: user,
                    assetId: jrc.address,
                    amount: 42,
                    reason: REASON_CODES.REASON_WITHDRAW,
                    nonce: 0
                },
                'Transfer',
                {
                    from: broker.address,
                    to: user,
                    value: 42
                },
                'SlowWithdraw',
                {
                    withdrawer: user,
                    assetId: jrc.address,
                    amount: 42
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('withdraws amount to user', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)

            await broker.announceWithdraw(jrc.address, 42, { from: user })
            await increaseEvmTime(announceDelay)

            await broker.slowWithdraw(user, jrc.address, 42, { from: user })

            await validateBalance(user, jrc, 0)
            await validateExternalBalance(user, jrc, 42)
        })
    })

    contract('when the withdrawal was not pre-announced', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)

            await increaseEvmTime(announceDelay)

            await assertReversion(
                broker.slowWithdraw(user, jrc.address, 42, { from: user }),
                '17'
            )

            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)
        })
    })

    contract('when the withdrawal time has not passed', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)

            await broker.announceWithdraw(jrc.address, 42, { from: user })
            await increaseEvmTime(announceDelay - 10)

            await assertReversion(
                broker.slowWithdraw(user, jrc.address, 42, { from: user }),
                '18'
            )

            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)
        })
    })

    contract('when the withdrawal amount does not match the announced amounbt', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)

            await broker.announceWithdraw(jrc.address, 42, { from: user })
            await increaseEvmTime(announceDelay)

            await assertReversion(
                broker.slowWithdraw(user, jrc.address, 41, { from: user }),
                '19'
            )

            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)
        })
    })
})
