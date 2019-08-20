const { ETHER_ADDR } = require('../constants')
const { web3, getBroker, validateBalance } = require('../utils')

contract('Test deposit', async (accounts) => {
    let broker
    const user = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
    })

    it('updates user balance with the deposited amount', async () => {
        const amount = web3.utils.toWei('1', 'ether')

        await broker.deposit({ from: user, value: amount })
        await validateBalance(user, ETHER_ADDR, '1000000000000000000')

        await broker.deposit({ from: user, value: amount })
        await validateBalance(user, ETHER_ADDR, '2000000000000000000')
    })
})
