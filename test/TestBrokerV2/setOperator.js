const { getBroker, assertAsync } = require('../utils')

contract('Test setOperator', async (accounts) => {
    let broker
    const operator = accounts[0]
    const user = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('sets broker.operator', async () => {
            await assertAsync(broker.operator(), operator)
            await broker.setOperator(user)
            await assertAsync(broker.operator(), user)
        })
    })
})
