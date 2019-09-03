const { getBroker, getTokenList, getDgtx, validateBalance, validateExternalBalance } = require('../utils')

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
})
