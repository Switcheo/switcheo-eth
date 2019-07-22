const BrokerV2 = artifacts.require('BrokerV2')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR } = require('../utils')

contract('Test depositEther', async (accounts) => {
    const broker = await BrokerV2.deployed()
    const user = accounts[0]

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
