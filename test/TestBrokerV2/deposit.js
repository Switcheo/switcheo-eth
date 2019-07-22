const BrokerV2 = artifacts.require('BrokerV2')
const { web3, ETHER_ADDR } = require('../utils')

contract('Test depositEther', async (accounts) => {
    let broker
    const user = accounts[0]

    beforeEach(async () => {
        broker = await BrokerV2.deployed()
    })

    it('updates user balance with the deposited amount', async () => {
        console.log('test')
        const amount = web3.utils.toWei('1', 'ether')
        await broker.deposit({ from: user, value: amount })
        let balance = await broker.balances(user, ETHER_ADDR)
        assert.equal(balance.toString(), '1000000000000000000')

        await broker.deposit({ from: user, value: amount })
        balance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(balance.toString(), '2000000000000000000')
    })
})
