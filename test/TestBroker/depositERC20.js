const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { REASON, assertEventEmission, assertError } = require('./helpers')

contract('Test depositERC20', async () => {
    let broker, token, coordinator, user

    beforeEach(async () => {
        broker = await Broker.deployed()
        token = await JRCoin.deployed()
        swToken = await SWCoin.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        operator = accounts[0]
        user = accounts[1]
        await token.mint.sendTransaction(user, 42)

        await swToken.mint.sendTransaction(user, 100)
        await swToken.approve.sendTransaction(broker.address, 100, { from: user })
        await broker.depositERC20.sendTransaction(user, swToken.address, 100, { from: coordinator })
    })

    contract('test event emission', async () => {
        it('emits BalanceIncrease event', async () => {
            await token.approve.sendTransaction(broker.address, 42,  { from: user })
            const { logs } = await broker.depositERC20(user, token.address, 20, { from: coordinator })
            assertEventEmission(logs, [{
                eventType: 'BalanceIncrease',
                args: {
                    user: user.toLowerCase(),
                    token: token.address,
                    amount: '20',
                    reason: REASON.ReasonDeposit
                }
            }])
        })
    })

    contract('with sufficient approval', async () => {
        it('updates user balance with the deposited amount', async () => {
            await token.approve.sendTransaction(broker.address, 42,  { from: user })
            await broker.depositERC20.sendTransaction(user, token.address, 20, { from: coordinator })
            let balance = await broker.balances.call(user, token.address)
            assert.equal(balance.toString(), '20')

            await broker.depositERC20.sendTransaction(user, token.address, 22, { from: coordinator })
            balance = await broker.balances.call(user, token.address)
            assert.equal(balance.toString(), '42')
        })
    })

    contract('without sufficient approval', async () => {
        it('does not allow the deposit', async () => {
            await token.approve.sendTransaction(broker.address, 29,  { from: user })
            await broker.depositERC20.sendTransaction(user, token.address, 28, { from: coordinator })
            let balance = await broker.balances.call(user, token.address)
            assert.equal(balance.toString(), '28')

            await assertError(broker.depositERC20.sendTransaction, user, token.address, 2, { from: coordinator })
        })
    })

    contract('without coordinator', async () => {
        it('does not allow the deposit', async () => {
            await token.approve.sendTransaction(broker.address, 42,  { from: user })
            await assertError(broker.depositERC20.sendTransaction, user, token.address, 20, { from: user })
        })
    })
})
