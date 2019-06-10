const Broker = artifacts.require('Broker')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)
const { ETHER_ADDR, REASON, assertEventEmission } = require('../../utils/testUtils')

contract('Test depositEther', async () => {
    let broker, user, accounts

    beforeEach(async () => {
        broker = await Broker.deployed()
        accounts = await web3.eth.getAccounts()
        user = accounts[1]
    })

    contract('test event emission', async () => {
        it('emits BalanceIncrease event', async () => {
            const amount = web3.utils.toWei('1', 'ether')
            const { receipt: { rawLogs: logs } } = await broker.depositEther({ from: user, value: amount })
            assertEventEmission(logs, [{
                eventType: 'BalanceIncrease',
                args: {
                    user: user,
                    token: ETHER_ADDR,
                    amount: '1000000000000000000',
                    reason: REASON.ReasonDeposit
                }
            }])
        })
    })

    it('updates user balance with the deposited amount', async () => {
        const amount = web3.utils.toWei('1', 'ether')
        await broker.depositEther.sendTransaction({ from: user, value: amount })
        let balance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(balance.toString(), '1000000000000000000')

        await broker.depositEther.sendTransaction({ from: user, value: amount })
        balance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(balance.toString(), '2000000000000000000')
    })
})
