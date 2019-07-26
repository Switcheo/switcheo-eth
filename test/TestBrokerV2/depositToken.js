const { web3, getBroker, getJrc, validateBalance,
        validateExternalBalance } = require('../utils')

contract('Test depositToken', async (accounts) => {
    let broker, jrc
    const user = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()

        await jrc.mint(user, 42)
    })

    it('updates user balance with the deposited amount', async () => {
        await jrc.approve(broker.address, 42, { from: user })
        await broker.depositToken(user, jrc.address)
        await validateBalance(user, jrc.address, 42)
        await validateExternalBalance(user, jrc, 0)
        await validateExternalBalance(broker, jrc, 42)
    })
})
