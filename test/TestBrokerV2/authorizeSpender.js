const { getSpenderList, exchange } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test authorizeSpender', async (accounts) => {
    let spenderList
    const user = accounts[1]
    const privateKey = getPrivateKey(user)
    const spender = accounts[2]

    beforeEach(async () => {
        spenderList = await getSpenderList()
    })

    contract('when parameters are valid', async () => {
        it('marks a spender as authorized', async () => {
            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            const authorized = await spenderList.spenderAuthorizations(user, spender)
            assert.equal(authorized, true)
        })
    })
})
