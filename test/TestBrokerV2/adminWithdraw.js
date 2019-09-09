const { getBroker, getJrc, validateBalance, validateExternalBalance,
        exchange, assertReversion } = require('../utils')

contract('Test emergencyWithdraw', async (accounts) => {
    let broker, jrc
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        await jrc.mint(user, 42)
    })

    contract('when parameters are valid', async () => {
        it('withdraws amount to user', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)

            await broker.setAdminState(1)
            await broker.adminWithdraw(user, jrc.address, 40, 4)

            await validateBalance(user, jrc, 2)
            await validateExternalBalance(user, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)
        })
    })

    contract('when the nonce has been used before', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)

            await broker.setAdminState(1)
            await broker.adminWithdraw(user, jrc.address, 40, 4)

            await validateBalance(user, jrc, 2)
            await validateExternalBalance(user, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)

            await assertReversion(
                broker.adminWithdraw(user, jrc.address, 40, 4),
                '36'
            )

            await validateBalance(user, jrc, 2)
            await validateExternalBalance(user, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)
        })
    })
})
