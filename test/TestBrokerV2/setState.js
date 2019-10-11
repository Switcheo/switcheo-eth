const { getBroker, assertAsync } = require('../utils')

contract('Test setState', async (accounts) => {
    let broker

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('sets broker.state', async () => {
            await assertAsync(broker.state(), 0)
            await broker.setState(1)
            await assertAsync(broker.state(), 1)
        })
    })
})
