const { getBroker, assertAsync } = require('../utils')
const { MAX_SLOW_WITHDRAW_DELAY } = require('../constants')

contract('Test setSlowWithdrawDelay', async (accounts) => {
    let broker

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('sets broker.operator', async () => {
            await assertAsync(broker.slowWithdrawDelay(), MAX_SLOW_WITHDRAW_DELAY)
            await broker.setSlowWithdrawDelay(20)
            await assertAsync(broker.slowWithdrawDelay(), 20)
        })
    })
})
