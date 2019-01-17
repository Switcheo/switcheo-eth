const Broker = artifacts.require('Broker')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR, REASON, assertError, assertEventEmission } = require('../../utils/testUtils')
const announceDelay = 604800

increaseTime = async (time) => (
    new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_increaseTime", params: [time], id: new Date().getTime() },
            (err, _result) => {
                if (err) return reject(err)

                web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_mine", params: [], id: new Date().getTime() },
                    (err, result) => {
                        if (err) reject(err)
                        else resolve(result)
                    }
                )
            }
        )
    })
)

contract('Test announceWithdraw + slowWithdraw', async () => {
    let broker, coordinator, user, accounts

    beforeEach(async () => {
        broker = await Broker.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        user = accounts[1]
    })

    contract('test event emission', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it('emits WithdrawAnnounce and BalanceDecrease event', async () => {
            const r1 = await broker.announceWithdraw(ETHER_ADDR, ethersDeposited, { from: user })
            assertEventEmission(r1.logs, [{
                eventType: 'WithdrawAnnounce',
                args: {
                    user: user.toLowerCase(),
                    token: ETHER_ADDR,
                    amount: '1000000000000000000'
                }
            }])

            await increaseTime(announceDelay)

            const r2 = await broker.slowWithdraw(user, ETHER_ADDR, ethersDeposited, { from: user })
            assertEventEmission(r2.logs, [{
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

    contract('announceWithdraw without sufficient balance', async () => {
        const ethersDeposited = web3.utils.toWei('0.9', 'ether')
        const invalidEthers = web3.utils.toWei('100', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it('throws an error', async () => {
            await assertError(broker.announceWithdraw.sendTransaction, ETHER_ADDR, invalidEthers, { from: user })
        })
    })

    contract('without sufficient delay after announceWithdraw', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
            await broker.announceWithdraw.sendTransaction(ETHER_ADDR, ethersDeposited, { from: user })
            await increaseTime(announceDelay - 900)
        })

        it('throws an error', async () => {
            await assertError(broker.slowWithdraw.sendTransaction, user, ETHER_ADDR, ethersDeposited)
        })
    })

    contract('without matching amounts', async () => {
        const ethersDeposited = web3.utils.toWei('0.9', 'ether')
        const oneEther = web3.utils.toWei('1', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
            await broker.announceWithdraw.sendTransaction(ETHER_ADDR, ethersDeposited, { from: user })
            await increaseTime(announceDelay)
        })

        it('throws an error', async () => {
            await assertError(broker.slowWithdraw.sendTransaction, user, ETHER_ADDR, oneEther)
        })
    })

    contract('without announceWithdraw', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')
        const getWalletEther = () => web3.eth.getBalance(user)
        const getContractEther = () => broker.balances.call(user, ETHER_ADDR)

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
            await increaseTime(announceDelay)
        })

        it('throws an error', async () => {
            await assertError(broker.slowWithdraw.sendTransaction, user, ETHER_ADDR, 0, { from: user })
        })
    })

    contract('with sufficient balance and delay after announceWithdraw', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')

        const getWalletEther = () => web3.eth.getBalance(user)

        const getContractEther = () => broker.balances.call(user, ETHER_ADDR)

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
            await broker.announceWithdraw.sendTransaction(ETHER_ADDR, ethersDeposited, { from: user })
            await increaseTime(announceDelay)
        })

        it('sends ether to the user', async () => {
            const initialBalance = await getWalletEther()

            await broker.slowWithdraw.sendTransaction(user, ETHER_ADDR, ethersDeposited, { from: coordinator })

            const finalBalance = await getWalletEther()

            assert.equal((finalBalance - initialBalance).toString(), '1000000000000000000')
        })

        it('updates internal balance and clears announcement after withdrawal', async () => {
            const initialBalance = await getContractEther()
            assert.equal(initialBalance.toString(), '1000000000000000000')

            await broker.slowWithdraw.sendTransaction(user, ETHER_ADDR, ethersDeposited, { from: user })

            const finalBalance = await getContractEther()
            assert.equal(finalBalance.toString(), '0')

            await assertError(broker.slowWithdraw.sendTransaction, user, ETHER_ADDR, ethersDeposited, { from: user })
        })
    })
})
