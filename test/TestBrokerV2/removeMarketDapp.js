const { getBroker, assertAsync } = require('../utils')
const { ZERO_ADDR } = require('../constants')

contract('Test removeMarketDapp', async (accounts) => {
    let broker
    const dapp = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('when parameters are valid', async () => {
        it('removes a market DApp', async () => {
            await broker.addMarketDapp(dapp)
            await assertAsync(broker.marketDapps(2), dapp)

            await broker.removeMarketDapp(2)
            await assertAsync(broker.marketDapps(2), ZERO_ADDR)
        })
    })
})
