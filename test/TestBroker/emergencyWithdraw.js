const Broker = artifacts.require('Broker')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ZERO_ADDR, ETHER_ADDR, REASON, nonceGenerator, emptyOfferParams, getValidOfferParams,
    assertError, assertOfferParams, assertEtherBalance, makeOffer, assertEventEmission,
    getOfferHash } = require('../../utils/testUtils')

contract('Test emergencyWithdraw', async () => {
    let broker, user, accounts, coordinator, initialEtherBalance

    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    beforeEach(async () => {
        broker = await Broker.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        user = accounts[1]
        await broker.depositEther.sendTransaction({ from: user, value: web3.utils.toWei('1', 'ether') })
        initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(initialEtherBalance, '1000000000000000000')
    })

    contract('test event emission', async () => {
        it('emits BalanceDecrease event', async () => {
            await broker.setState.sendTransaction(1)
            const { logs } = await broker.emergencyWithdraw(user, ETHER_ADDR, initialEtherBalance)
            assertEventEmission(logs, [{
                eventType: 'BalanceDecrease',
                args: {
                    user: user.toLowerCase(),
                    token: ETHER_ADDR,
                    amount: '1000000000000000000',
                    reason: REASON.ReasonWithdraw
                }
            }])
        })
    })

    contract('when trading is frozen', async () => {
        it('sends ether to the user', async () => {
            const initialWalletEther = await web3.eth.getBalance(user)

            await broker.setState.sendTransaction(1)
            await broker.emergencyWithdraw.sendTransaction(user, ETHER_ADDR, initialEtherBalance)

            const finalWalletEther = await web3.eth.getBalance(user)
            assert.equal((finalWalletEther - initialWalletEther).toString(), initialEtherBalance)

            const finalContractBalance = await broker.balances.call(user, ETHER_ADDR)
            assert.equal(finalContractBalance, '0')
        })
    })

    contract('when trading is not frozen', async () => {
        it('throws an error', async () => {
            const initialWalletEther = await web3.eth.getBalance(user)
            await assertError(broker.emergencyWithdraw.sendTransaction, user, ETHER_ADDR, initialEtherBalance)

            const finalWalletEther = await web3.eth.getBalance(user)
            assert.equal((finalWalletEther - initialWalletEther).toString(), '0')

            const finalContractBalance = await broker.balances.call(user, ETHER_ADDR)
            assert.equal(finalContractBalance.toString(), initialEtherBalance.toString())
        })
    })
})
