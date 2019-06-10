const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)
const { BigNumber } = require('bignumber.js')

const { ETHER_ADDR, REASON, nonceGenerator, assertError, assertEventEmission,
    assertWalletEtherAmount, assertEtherBalance, withdraw, withdrawFrom, signWithdraw } = require('../../utils/testUtils')

contract('Test withdraw', async () => {
    let broker, token, coordinator, user, accounts

    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    beforeEach(async () => {
        broker = await Broker.deployed()
        token = await JRCoin.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        operator = accounts[0]
        user = accounts[1]
    })

    contract('test event emission', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
            await token.mint.sendTransaction(user, '100')
            await token.approve.sendTransaction(broker.address, '100',  { from: user })
            await broker.depositERC20.sendTransaction(user, token.address, '100', { from: coordinator })
        })

        contract('when there are no fees', async () => {
            it('emits BalanceDecrease event', async () => {
                const params = {
                    withdrawer: user,
                    token: ETHER_ADDR,
                    amount: ethersDeposited,
                    feeAsset: ETHER_ADDR,
                    feeAmount: '0',
                    nonce: nextNonce()
                }
                const { receipt: { rawLogs: logs } } = await withdraw(broker, params)
                assertEventEmission(logs, [{
                    eventType: 'BalanceDecrease',
                    args: {
                        user: user,
                        token: ETHER_ADDR,
                        amount: '1000000000000000000',
                        reason: REASON.ReasonWithdraw
                    }
                }])
            })
        })

        contract('when there are fees', async () => {
            it('emits BalanceDecrease, BalanceIncrease event', async () => {
                const withdrawAmount = new BigNumber(ethersDeposited).minus(7)
                const params = {
                    withdrawer: user,
                    token: ETHER_ADDR,
                    amount: withdrawAmount.toString(),
                    feeAsset: ETHER_ADDR,
                    feeAmount: '7',
                    nonce: nextNonce()
                }
                const { receipt: { rawLogs: logs } } = await withdraw(broker, params)
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user,
                            token: ETHER_ADDR,
                            amount: '1000000000000000000',
                            reason: REASON.ReasonWithdraw
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator,
                            token: ETHER_ADDR,
                            amount: '7',
                            reason: REASON.ReasonWithdrawFeeReceive
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })

        contract('when the fee asset is different from the withdraw asset', async () => {
            it('emits BalanceDecrease, BalanceDecrease, BalanceIncrease event', async () => {
                const params = {
                    withdrawer: user,
                    token: ETHER_ADDR,
                    amount: ethersDeposited,
                    feeAsset: token.address,
                    feeAmount: '20',
                    nonce: nextNonce()
                }
                const { receipt: { rawLogs: logs } } = await withdraw(broker, params)
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user,
                            token: ETHER_ADDR,
                            amount: '1000000000000000000',
                            reason: REASON.ReasonWithdraw
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user,
                            token: token.address,
                            amount: '20',
                            reason: REASON.ReasonWithdrawFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator,
                            token: token.address,
                            amount: '20',
                            reason: REASON.ReasonWithdrawFeeReceive
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })
    })

    contract('test fees', async () => {
        beforeEach(async () => {
            await token.mint.sendTransaction(user, '100')
            await token.approve.sendTransaction(broker.address, '100',  { from: user })
            await broker.depositERC20.sendTransaction(user, token.address,'100', { from: coordinator })
            await broker.depositEther.sendTransaction({ from: user, value: '20' })
        })

        contract('when the fee asset is the same as the withdraw asset', async () => {
            it('updates balances appropriately', async () => {
                const initialWalletBalance = await token.balanceOf.call(user)
                assert.equal(initialWalletBalance, '0')
                const initialContractBalance = await broker.balances.call(user, token.address)
                assert.equal(initialContractBalance, '100')
                const initialOperatorBalance = await broker.balances.call(operator, token.address)
                assert.equal(initialOperatorBalance, '0')

                const params = {
                    withdrawer: user,
                    token: token.address,
                    amount: '95',
                    feeAsset: token.address,
                    feeAmount: '1',
                    nonce: nextNonce()
                }
                await withdraw(broker, params)

                const walletBalance = await token.balanceOf.call(user)
                assert.equal(walletBalance, '95')
                const contractBalance = await broker.balances.call(user, token.address)
                assert.equal(contractBalance, '4')
                const operatorBalance = await broker.balances.call(operator, token.address)
                assert.equal(operatorBalance, '1')
            })

            contract('when the user has insufficient balance to pay fees', async () => {
                it('throws an error', async () => {
                    const initialWalletBalance = await token.balanceOf.call(user)
                    assert.equal(initialWalletBalance, '0')
                    const initialContractBalance = await broker.balances.call(user, token.address)
                    assert.equal(initialContractBalance, '100')
                    const initialOperatorBalance = await broker.balances.call(operator, token.address)
                    assert.equal(initialOperatorBalance, '0')

                    const params = {
                        withdrawer: user,
                        token: token.address,
                        amount: '95',
                        feeAsset: token.address,
                        feeAmount: '6',
                        nonce: nextNonce()
                    }
                    await assertError(withdraw, broker, params)

                    const walletBalance = await token.balanceOf.call(user)
                    assert.equal(walletBalance, '0')
                    const contractBalance = await broker.balances.call(user, token.address)
                    assert.equal(contractBalance, '100')
                    const operatorBalance = await broker.balances.call(operator, token.address)
                    assert.equal(operatorBalance, '0')
                })
            })
        })

        contract('when the fee asset is different from the withdraw asset', async () => {
            it('updates balances appropriately', async () => {
                const initialWalletBalance = await token.balanceOf.call(user)
                assert.equal(initialWalletBalance, '0')

                const initialContractBalance = await broker.balances.call(user, token.address)
                assert.equal(initialContractBalance, '100')

                const initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
                assert.equal(initialEtherBalance, '20')

                const initialOperatorBalance = await broker.balances.call(operator, ETHER_ADDR)
                assert.equal(initialOperatorBalance, '0')

                const params = {
                    withdrawer: user,
                    token: token.address,
                    amount: '95',
                    feeAsset: ETHER_ADDR,
                    feeAmount: '7',
                    nonce: nextNonce()
                }
                await withdraw(broker, params)

                const walletBalance = await token.balanceOf.call(user)
                assert.equal(walletBalance, '95')

                const contractBalance = await broker.balances.call(user, token.address)
                assert.equal(contractBalance, '5')

                const etherBalance = await broker.balances.call(user, ETHER_ADDR)
                assert.equal(etherBalance, '13')

                const operatorBalance = await broker.balances.call(operator, ETHER_ADDR)
                assert.equal(operatorBalance, '7')
            })

            contract('when the user has insufficient balance to pay fees', async () => {
                it('throws an error', async () => {
                    const initialWalletBalance = await token.balanceOf.call(user)
                    assert.equal(initialWalletBalance, '0')

                    const initialContractBalance = await broker.balances.call(user, token.address)
                    assert.equal(initialContractBalance, '100')

                    const initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
                    assert.equal(initialEtherBalance, '20')

                    const initialOperatorBalance = await broker.balances.call(operator, ETHER_ADDR)
                    assert.equal(initialOperatorBalance, '0')

                    const params = {
                        withdrawer: user,
                        token: token.address,
                        amount: '95',
                        feeAsset: ETHER_ADDR,
                        feeAmount: '21',
                        nonce: nextNonce()
                    }
                    await assertError(withdraw, broker, params)

                    const walletBalance = await token.balanceOf.call(user)
                    assert.equal(walletBalance, '0')

                    const contractBalance = await broker.balances.call(user, token.address)
                    assert.equal(contractBalance, '100')

                    const etherBalance = await broker.balances.call(user, ETHER_ADDR)
                    assert.equal(etherBalance, '20')

                    const operatorBalance = await broker.balances.call(operator, ETHER_ADDR)
                    assert.equal(operatorBalance, '0')
                })
            })
        })
    })

    contract('with sufficient ether balance', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')

        const getWalletEther = () => web3.eth.getBalance(user)

        const getContractEther = () => broker.balances.call(user, ETHER_ADDR)

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it('sends ether to the user', async () => {
            const initialBalance = await getWalletEther()

            const params = {
                withdrawer: user,
                token: ETHER_ADDR,
                amount: ethersDeposited,
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await withdraw(broker, params)

            const finalBalance = await getWalletEther()

            assert.equal((finalBalance - initialBalance).toString(), '1000000000000000000')
        })

        it('updates internal balance after withdrawal', async () => {
            const initialBalance = await getContractEther()
            assert.equal(initialBalance.toString(), '1000000000000000000')

            const params = {
                withdrawer: user,
                token: ETHER_ADDR,
                amount: '999999999999999999',
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await withdraw(broker, params)

            const finalBalance = await getContractEther()
            assert.equal(finalBalance.toString(), '1')
        })
    })

    contract('with sufficient token balance', async () => {
        const tokensDeposited = 42

        const getWalletTokens = () => token.balanceOf.call(user)

        const getContractTokens = () => broker.balances.call(user, token.address)

        beforeEach(async () => {
            await token.mint.sendTransaction(user, tokensDeposited)
            await token.approve.sendTransaction(broker.address, tokensDeposited,  { from: user })
            await broker.depositERC20.sendTransaction(user, token.address, tokensDeposited, { from: coordinator })
        })

        it('sends tokens to the user', async () => {
            const initialBalance = await getWalletTokens()
            assert.equal(initialBalance.toString(), '0')

            const params = {
                withdrawer: user,
                token: token.address,
                amount: tokensDeposited,
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await withdraw(broker, params)

            const finalBalance = await getWalletTokens()
            assert.equal(finalBalance.toString(), '42')
        })

        it('updates internal balance after withdrawal', async () => {
            const initialBalance = await getContractTokens()
            assert.equal(initialBalance.toString(), '42')

            const params = {
                withdrawer: user,
                token: token.address,
                amount: '2',
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await withdraw(broker, params)

            const finalBalance = await getContractTokens()
            assert.equal(finalBalance.toString(), '40') // 42 - 2
        })
    })

    contract('when the signature is incorrect', async () => {
        const ethersDeposited = web3.utils.toWei('0.9', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it ('throws an error', async () => {
            const remainingWalletEther = await web3.eth.getBalance(user)
            const params = {
                withdrawer: user,
                token: ETHER_ADDR,
                amount: ethersDeposited,
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            const signature = await signWithdraw(params, coordinator)
            await assertError(withdraw, broker, params, signature)
            await assertEtherBalance(broker, user, '900000000000000000', 'User\'s balance did not change')
            await assertWalletEtherAmount(user, remainingWalletEther.toString(), 'User\'s personal wallet amount did not change')
            await assertWalletEtherAmount(broker.address, '900000000000000000', 'Broker\'s balance did not change')
        })
    })

    contract('when the same parameters are used twice', async () => {
        const getContractEther = () => broker.balances.call(user, ETHER_ADDR)

        const ethersDeposited = web3.utils.toWei('1', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it ('throws an error', async () => {
            const initialBalance = await getContractEther()
            assert.equal(initialBalance.toString(), '1000000000000000000')

            const params = {
                withdrawer: user,
                token: ETHER_ADDR,
                amount: '1',
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await withdraw(broker, params)

            const updatedBalance1 = await getContractEther()
            assert.equal(updatedBalance1.toString(), '999999999999999999')

            await assertError(withdraw, broker, params)

            const updatedBalance2 = await getContractEther()
            assert.equal(updatedBalance2.toString(), '999999999999999999')
        })
    })

    contract('without sufficient balance', async () => {
        const ethersDeposited = web3.utils.toWei('0.9', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it('throws an error', async () => {
            const remainingWalletEther = await web3.eth.getBalance(user)
            const params = {
                withdrawer: user,
                token: ETHER_ADDR,
                amount: web3.utils.toWei('1', 'ether'),
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await assertError(withdraw, broker, params)
            await assertEtherBalance(broker, user, '900000000000000000', 'User\'s balance did not change')
            await assertWalletEtherAmount(user, remainingWalletEther.toString(), 'User\'s personal wallet amount did not change')
            await assertWalletEtherAmount(broker.address, '900000000000000000', 'Broker\'s balance did not change')
        })
    })

    contract('without coordinator', async () => {
        const ethersDeposited = web3.utils.toWei('1', 'ether')

        beforeEach(async () => {
            await broker.depositEther.sendTransaction({ from: user, value: ethersDeposited })
        })

        it('throws an error', async () => {
            const initialWalletEther = new BigNumber(await web3.eth.getBalance(user))
            const params = {
                withdrawer: user,
                token: ETHER_ADDR,
                amount: ethersDeposited,
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            }
            await assertError(withdrawFrom, broker, params, user)
            await assertEtherBalance(broker, user, '1000000000000000000', 'User\'s balance did not change')
            const updatedWalletEther = new BigNumber(await web3.eth.getBalance(user))
            assert(updatedWalletEther.isLessThan(initialWalletEther), 'User\'s personal wallet amount did not increase')
            await assertWalletEtherAmount(broker.address, '1000000000000000000', 'Broker\'s balance did not change')
        })
    })
})
