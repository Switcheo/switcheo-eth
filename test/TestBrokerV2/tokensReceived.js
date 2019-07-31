const { web3, getBroker, getZeus, validateBalance,
        validateExternalBalance, assertRevert } = require('../utils')

contract('Test tokensReceived', async (accounts) => {
    let broker, zeus
    const owner = accounts[0]
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
        zeus = await getZeus(accounts[0])

        await zeus.mint(user, 87)
    })

    contract('when parameters are valid', async () => {
        it('deposits tokens', async () => {
            await validateExternalBalance(user, zeus, 87)
            await validateBalance(user, zeus, 0)

            await broker.whitelistToken(zeus.address)
            await zeus.send(broker.address, 87, "0x0", { from: user })

            await validateExternalBalance(user, zeus, 0)
            await validateBalance(user, zeus, 87)
        })
    })
})
