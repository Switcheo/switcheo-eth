const { getBroker, getJrc, validateBalance,
        validateExternalBalance, exchange } = require('../utils')

contract('Test emergencyWithdraw', async (accounts) => {
    let broker, jrc
    const operator = accounts[0]
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
            await broker.adminWithdraw(user, jrc.address, 40, 4, { from: operator })

            await validateBalance(user, jrc, 2)
            await validateExternalBalance(user, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)
        })
    })
})
