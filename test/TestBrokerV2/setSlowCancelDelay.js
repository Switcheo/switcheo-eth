const { getBroker, assertAsync } = require('../utils')
const { MAX_SLOW_CANCEL_DELAY } = require('../constants')

contract('Test setSlowCancelDelay', async (accounts) => {
    let broker

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('sets broker.operator', async () => {
            await assertAsync(broker.slowCancelDelay(), MAX_SLOW_CANCEL_DELAY)
            await broker.setSlowCancelDelay(20)
            await assertAsync(broker.slowCancelDelay(), 20)
        })
    })
})
