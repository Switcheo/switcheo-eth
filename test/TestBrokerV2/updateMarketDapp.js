const { getBroker, assertAsync } = require('../utils')

contract('Test updateMarketDapp', async (accounts) => {
    let broker
    const dapp1 = accounts[1]
    const dapp2 = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('updates a market DApp', async () => {
            await broker.addMarketDapp(dapp1)
            await assertAsync(broker.marketDapps(2), dapp1)

            await broker.updateMarketDapp(2, dapp2)
            await assertAsync(broker.marketDapps(2), dapp2)
        })
    })
})
