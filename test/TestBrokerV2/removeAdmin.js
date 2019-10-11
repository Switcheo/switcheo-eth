const { getBroker, assertAsync } = require('../utils')

contract('Test removeAdmin', async (accounts) => {
    let broker
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('removes an admin', async () => {
            await assertAsync(broker.isAdmin(user), false)
            await broker.addAdmin(user)
            await assertAsync(broker.isAdmin(user), true)

            await broker.removeAdmin(user)
            await assertAsync(broker.isAdmin(user), false)
        })
    })
})
