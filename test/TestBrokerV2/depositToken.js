const { getBroker, getJrc, validateBalance, validateExternalBalance,
        assertReversion } = require('../utils')

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
            await broker.depositToken(user, jrc.address, 42, 42, 1)
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)
            await validateExternalBalance(broker, jrc, 42)
        })
    })

    contract('when the nonce has been used before', async () => {
        it('raises an error', async () => {
            await jrc.approve(broker.address, 42, { from: user })
            await broker.depositToken(user, jrc.address, 42, 42, 1)
            await assertReversion(
                broker.depositToken(user, jrc.address, 42, 42, 1),
                '36'
            )
        })
    })

    contract('when the transferred amount does not match the expected amount', async () => {
        it('raises an error', async () => {
            await jrc.approve(broker.address, 42, { from: user })
            await assertReversion(
                broker.depositToken(user, jrc.address, 42, 41, 1),
                'Invalid transfer'
            )
        })
    })
})
