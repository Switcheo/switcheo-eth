const { getBroker, assertAsync, assertReversion } = require('../utils')

contract('Test addMarketDapp', async (accounts) => {
    let broker
    const dapp = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('adds a market DApp', async () => {
            // there should be an "invalid opcode" error as 2 is out of range of
            // the broker.marketDapps array length
            await assertReversion(broker.marketDapps(2), 'invalid opcode')
            await broker.addMarketDapp(dapp)
            await assertAsync(broker.marketDapps(2), dapp)
        })
    })
})
