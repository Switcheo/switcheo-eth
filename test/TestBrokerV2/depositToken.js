const { web3, getBroker, getJrc, validateBalance,
        validateExternalBalance, assertRevert } = require('../utils')

contract('Test depositToken', async (accounts) => {
    let broker, jrc
    const user = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()

        await jrc.mint(user, 42)
    })

    contract('when parameters are valid', async () => {
        it('deposits tokens', async () => {
            await jrc.approve(broker.address, 42, { from: user })
            await broker.depositToken(user, jrc.address, 1)
            await validateBalance(user, jrc.address, 42)
            await validateExternalBalance(user, jrc, 0)
            await validateExternalBalance(broker, jrc, 42)
        })
    })

    contract('when nonce is repeated', async () => {
        it('raises an error', async () => {
            const nonce = 178
            await jrc.approve(broker.address, 20, { from: user })
            await broker.depositToken(user, jrc.address, nonce)
            await validateBalance(user, jrc.address, 20)

            await jrc.approve(broker.address, 21, { from: user })
            await assertRevert(broker.depositToken(user, jrc.address, nonce))

            broker.depositToken(user, jrc.address, nonce + 1)
            await validateBalance(user, jrc.address, 41)
        })
    })
})
