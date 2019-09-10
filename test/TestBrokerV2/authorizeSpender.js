const { getSpenderList, exchange, assertReversion, testEvents } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test authorizeSpender', async (accounts) => {
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
            const result = await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            testEvents(result, [
                'AuthorizeSpender',
                {
                    user,
                    spender,
                    nonce: 1
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('marks a spender as authorized', async () => {
            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            const authorized = await spenderList.spenderAuthorizations(user, spender)
            assert.equal(authorized, true)
        })
    })

    contract('when spender is not whitelisted', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey }),
                'Spender not whitelisted'
            )
        })
    })

    contract('when spender is already authorized', async () => {
        it('raises an error', async () => {
            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            await assertReversion(
                exchange.authorizeSpender({ user, spender, nonce: 2 }, { privateKey }),
                'Spender already authorized'
            )
        })
    })

    contract('when the nonce has been used before', async () => {
        it('raises an error', async () => {
            await spenderList.whitelistSpender(spender)
            await exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey })

            await spenderList.unwhitelistSpender(spender)
            await spenderList.unauthorizeSpender(spender, { from: user })

            await spenderList.whitelistSpender(spender)

            await assertReversion(
                exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey }),
                '36' // nonce already used
            )
        })
    })

    contract('when signature is invalid', async () => {
        it('raises an error', async () => {
            await spenderList.whitelistSpender(spender)
            const diffPrivateKey = getPrivateKey(accounts[3])
            await assertReversion(
                exchange.authorizeSpender({ user, spender, nonce: 1 }, { privateKey: diffPrivateKey }),
                'Invalid signature'
            )
        })
    })
})
