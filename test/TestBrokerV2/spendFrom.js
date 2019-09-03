const { getBroker, getSpenderList, getJrc, exchange, validateBalance } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test spendFrom', async (accounts) => {
    let broker, spenderList, jrc
    const user = accounts[1]
    const privateKey = getPrivateKey(user)
    const spender = accounts[2]
    const receiver = accounts[3]

    beforeEach(async () => {
        broker = await getBroker()
        spenderList = await getSpenderList()
        jrc = await getJrc()
        await jrc.mint(user, 42)
    })

    contract('when parameters are valid', async () => {
        it('transfers funds', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(user, jrc, 42)
            await validateBalance(receiver, jrc, 0)

            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 2 }, { privateKey })
            await broker.spendFrom(user, receiver, jrc.address, 42, { from: spender })

            await validateBalance(user, jrc, 0)
            await validateBalance(receiver, jrc, 42)
        })
    })
})
