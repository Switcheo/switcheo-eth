const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const AtomicBroker = artifacts.require('AtomicBroker')

const { fundUser, createSwap, cancelSwap, cancelSwapFrom, executeSwap, assertSwapExists, getSampleSwapParams,
        assertError, assertEventEmission, assertBalances, REASON,
        increaseEvmTime, assertSwapDoesNotExist } = require('../../utils/testUtils')

contract('Test cancelSwap', async (accounts) => {
    let broker, atomicBroker, token, secondToken, swapParams
    const owner = accounts[0]
    const coordinator = accounts[0]
    const operator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]
    const bob = accounts[3]

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
        token = await JRCoin.deployed()
        secondToken = await SWCoin.deployed()
        await fundUser({ broker, user: maker, coordinator }, { jrc: 1000 })
        await broker.approveSpender(atomicBroker.address, { from: maker })
    })


    contract('when the fee asset is the same as the swap token', async () => {
        beforeEach(async () => {
            swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.feeAmount = 10
            await createSwap(atomicBroker, swapParams)
            await assertSwapExists(atomicBroker, swapParams)
        })

        contract('test event emission', async () => {
            it('emits BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, CancelSwap events', async () => {
                await increaseEvmTime(700)
                const result = await cancelSwap(atomicBroker, { ...swapParams, cancelFeeAmount: 2 })

                assertEventEmission(result, [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 997,
                            reason: REASON.ReasonSwapCancelHolderGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: maker,
                            token: swapParams.token,
                            amount: 997,
                            reason: REASON.ReasonSwapCancelMakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 2,
                            reason: REASON.ReasonSwapCancelFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator,
                            token: swapParams.token,
                            amount: 2,
                            reason: REASON.ReasonSwapCancelFeeReceive
                        }
                    },
                    {
                        eventType: 'CancelSwap',
                        args: {
                            hashedSecret: swapParams.hashedSecret
                        }
                    }
                ])
            })
        })

        contract('when valid values are used', async () => {
            it('cancels the swap and refunds the maker', async () => {
                await increaseEvmTime(700)
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })
                const cancelSwapResult = await cancelSwap(atomicBroker, { ...swapParams, cancelFeeAmount: 2 })
                await assertBalances(broker, {
                    [maker]: { jrc: 998, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 2, swc: 0 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
                await assertSwapDoesNotExist(atomicBroker, swapParams)
            })
        })

        contract('when the sender is not the coordinator', async () => {
            it('the cancel fee argument is ignored, and the full fee amount is charged', async () => {
                await increaseEvmTime(700)
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })
                await cancelSwapFrom(atomicBroker, { ...swapParams, cancelFeeAmount: 2 }, bob)
                await assertBalances(broker, {
                    [maker]: { jrc: 990, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 10, swc: 0 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
                await assertSwapDoesNotExist(atomicBroker, swapParams)
            })
        })

        contract('when the swap has already been executed', async () => {
            beforeEach(async () => {
                await executeSwap(atomicBroker, swapParams)
                await assertSwapDoesNotExist(atomicBroker, swapParams)
            })

            it('it raises an error', async () => {
                await increaseEvmTime(700)
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 989, swc: 0 },
                    [operator]: { jrc: 10, swc: 0 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
                await assertError(cancelSwap, atomicBroker, { ...swapParams, cancelFeeAmount: 2 })
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 989, swc: 0 },
                    [operator]: { jrc: 10, swc: 0 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
            })
        })

        contract('when the expiry time has not passed', async () => {
            it('it raises an error', async () => {
                await increaseEvmTime(100)
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })
                await assertError(cancelSwap, atomicBroker, { ...swapParams, cancelFeeAmount: 2 })
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })
            })
        })

        contract('when the cancel fee exceeds the fee amount', async () => {
            it('it raises an error', async () => {
                await increaseEvmTime(700)
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })
                await assertError(cancelSwap, atomicBroker, { ...swapParams, cancelFeeAmount: 12 })
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })
            })
        })
    })

    contract('when the fee asset is different from the swap token', async () => {
        beforeEach(async () => {
            await fundUser({ broker, user: maker, coordinator }, { swc: 20 })
            swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.feeAsset = secondToken.address
            swapParams.feeAmount = 16
            await createSwap(atomicBroker, swapParams)
            await assertSwapExists(atomicBroker, swapParams)
        })

        contract('test event emission', async () => {
            it('emits BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, CancelSwap events', async () => {
                await increaseEvmTime(700)
                const result = await cancelSwap(atomicBroker, { ...swapParams, cancelFeeAmount: 5 })

                assertEventEmission(result, [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 999,
                            reason: REASON.ReasonSwapCancelHolderGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: maker,
                            token: swapParams.token,
                            amount: 999,
                            reason: REASON.ReasonSwapCancelMakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: secondToken.address,
                            amount: 5,
                            reason: REASON.ReasonSwapCancelFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator,
                            token: secondToken.address,
                            amount: 5,
                            reason: REASON.ReasonSwapCancelFeeReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: secondToken.address,
                            amount: 11,
                            reason: REASON.ReasonSwapCancelFeeRefundGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: maker,
                            token: secondToken.address,
                            amount: 11,
                            reason: REASON.ReasonSwapCancelFeeRefundReceive
                        }
                    },
                    {
                        eventType: 'CancelSwap',
                        args: {
                            hashedSecret: swapParams.hashedSecret
                        }
                    }
                ])
            })
        })

        contract('when valid values are used', async () => {
            it('updates balances appropriately', async () => {
                await increaseEvmTime(700)
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 4 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 16 }
                })
                await cancelSwap(atomicBroker, { ...swapParams, cancelFeeAmount: 5 })
                await assertBalances(broker, {
                    [maker]: { jrc: 1000, swc: 15 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 5 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
                await assertSwapDoesNotExist(atomicBroker, swapParams)
            })
        })
    })
})
