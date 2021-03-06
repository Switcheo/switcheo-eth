const { getSpenderList, exchange, assertReversion, testEvents } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test unauthorizeSpender', async (accounts) => {
    let spenderList
    const user = accounts[1]
    const privateKey = getPrivateKey(user)
    const spender = accounts[2]

    beforeEach(async () => {
        spenderList = await getSpenderList()
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            await spenderList.unwhitelistSpender(spender)
            const result = await spenderList.unauthorizeSpender(spender, { from: user })

            testEvents(result, [
                'UnauthorizeSpender',
                {
                    user,
                    spender
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('marks a spender as unauthorized', async () => {
            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            await spenderList.unwhitelistSpender(spender)
            await spenderList.unauthorizeSpender(spender, { from: user })

            await assertReversion(
                spenderList.validateSpenderAuthorization(user, spender),
                'Unauthorized spender'
            )
        })
    })
})
