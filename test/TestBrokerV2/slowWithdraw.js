const { web3, getBroker, getJrc, validateBalance, validateExternalBalance,
        increaseEvmTime, exchange } = require('../utils')

contract('Test slowWithdraw', async (accounts) => {
    let broker, jrc
    const operator = accounts[0]
    const user = accounts[1]
    const announceDelay = 604800

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        await jrc.mint(user, 42)
    })

    contract('when parameters are valid', async () => {
        it('withdraws amount to user', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 3 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(user, jrc, 0)

            await broker.announceWithdraw(jrc.address, 42, { from: user })
            await increaseEvmTime(announceDelay + 1)

            await broker.slowWithdraw(user, jrc.address, { from: user })

            await validateBalance(user, jrc, 0)
            await validateExternalBalance(user, jrc, 42)
        })
    })
})
