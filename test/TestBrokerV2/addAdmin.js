const { getBroker, assertAsync } = require('../utils')

contract('Test addAdmin', async (accounts) => {
    let broker
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('adds an admin', async () => {
            await assertAsync(broker.isAdmin(user), false)
            await broker.addAdmin(user)
            await assertAsync(broker.isAdmin(user), true)
        })
    })
})
