const { getBroker, exchange } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test authorizeSpender', async (accounts) => {
    let broker
    const user = accounts[1]
    const privateKey = getPrivateKey(user)
    const spender = accounts[2]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('marks a spender as authorized', async () => {
            await broker.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            const authorized = await broker.spenderAuthorizations(user, spender)
            assert.equal(authorized, true)
        })
    })
})
