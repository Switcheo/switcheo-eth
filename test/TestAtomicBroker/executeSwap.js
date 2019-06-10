const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const AtomicBroker = artifacts.require('AtomicBroker')

const { fundUser, createSwap, executeSwap, assertSwapExists, getSampleSwapParams,
        assertError, assertEventEmission, assertBalances,
        assertSwapDoesNotExist, REASON } = require('../../utils/testUtils')

contract('Test executeSwap', async (accounts) => {
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
            await createSwap(atomicBroker, swapParams)
            await assertSwapExists(atomicBroker, swapParams)
        })

        contract('test event emission', async () => {
            it('emits BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, ExecuteSwap events', async () => {
                const result = await executeSwap(atomicBroker, swapParams)
                assertEventEmission(result.receipt.rawLogs, [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 998,
                            reason: REASON.ReasonSwapHolderGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: taker,
                            token: swapParams.token,
                            amount: 998,
                            reason: REASON.ReasonSwapTakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 1,
                            reason: REASON.ReasonSwapFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator,
                            token: swapParams.token,
                            amount: 1,
                            reason: REASON.ReasonSwapFeeReceive
                        }
                    },
                    {
                        eventType: 'ExecuteSwap',
                        args: {
                            hashedSecret: swapParams.hashedSecret
                        }
                    }
                ])
            })
        })

        contract('when valid values are used', async () => {
            it('executes a swap', async () => {
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 0 }
                })

                const executeSwapResult = await executeSwap(atomicBroker, swapParams)
                await assertSwapDoesNotExist(atomicBroker, swapParams)

                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 0 },
                    [taker]: { jrc: 998, swc: 0 },
                    [operator]: { jrc: 1, swc: 0 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
            })

            contract('when the sender is not the coordinator', async () => {
                it('executes the swap', async () => {
                    await assertBalances(broker, {
                        [maker]: { jrc: 1, swc: 0 },
                        [taker]: { jrc: 0, swc: 0 },
                        [operator]: { jrc: 0, swc: 0 },
                        [atomicBroker.address]: { jrc: 999, swc: 0 }
                    })

                    const executeSwapResult = await executeSwap(atomicBroker, swapParams, { from: bob })
                    await assertSwapDoesNotExist(atomicBroker, swapParams)

                    await assertBalances(broker, {
                        [maker]: { jrc: 1, swc: 0 },
                        [taker]: { jrc: 998, swc: 0 },
                        [operator]: { jrc: 1, swc: 0 },
                        [atomicBroker.address]: { jrc: 0, swc: 0 }
                    })
                })
            })
        })

        contract('when the preimage does not match the hashedSecret', async () => {
            it('throws an error', async () => {
                assertError(executeSwap, atomicBroker, swapParams, '0xabc')
            })
        })
    })

    contract('when the fee asset is not the same as the swap token', async () => {
        beforeEach(async () => {
            swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.feeAsset = secondToken.address
            swapParams.feeAmount = 11
            await fundUser({ broker, user: maker, coordinator }, { swc: 20 })
            await createSwap(atomicBroker, swapParams)
            await assertSwapExists(atomicBroker, swapParams)
        })

        contract('test event emission', async () => {
            it('emits BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, ExecuteSwap events', async () => {
                const result = await executeSwap(atomicBroker, swapParams)
                assertEventEmission(result.receipt.rawLogs, [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 999,
                            reason: REASON.ReasonSwapHolderGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: taker,
                            token: swapParams.token,
                            amount: 999,
                            reason: REASON.ReasonSwapTakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.feeAsset,
                            amount: 11,
                            reason: REASON.ReasonSwapFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator,
                            token: swapParams.feeAsset,
                            amount: 11,
                            reason: REASON.ReasonSwapFeeReceive
                        }
                    },
                    {
                        eventType: 'ExecuteSwap',
                        args: {
                            hashedSecret: swapParams.hashedSecret
                        }
                    }
                ])
            })
        })

        contract('when valid values are used', async () => {
            it('updates balances appropriately', async () => {
                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 9 },
                    [taker]: { jrc: 0, swc: 0 },
                    [operator]: { jrc: 0, swc: 0 },
                    [atomicBroker.address]: { jrc: 999, swc: 11 }
                })

                await executeSwap(atomicBroker, swapParams)

                await assertBalances(broker, {
                    [maker]: { jrc: 1, swc: 9 },
                    [taker]: { jrc: 999, swc: 0 },
                    [operator]: { jrc: 0, swc: 11 },
                    [atomicBroker.address]: { jrc: 0, swc: 0 }
                })
            })
        })
    })
})
