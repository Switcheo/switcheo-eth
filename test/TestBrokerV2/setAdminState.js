const { getBroker, assertAsync } = require('../utils')

contract('Test setAdminState', async (accounts) => {
    let broker

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('sets broker.adminState', async () => {
            await assertAsync(broker.adminState(), 0)
            await broker.setAdminState(1)
            await assertAsync(broker.adminState(), 1)
        })
    })
})
