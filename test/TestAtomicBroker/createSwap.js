const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const AtomicBroker = artifacts.require('AtomicBroker')

const { fundUser, createSwap, assertSwapParams, getSampleSwapParams,
        assertError, assertSwapDoesNotExist, assertTokenBalance,
        assertEventEmission, REASON } = require('../../utils/testUtils')

contract('Test createSwap', async (accounts) => {
    let broker, atomicBroker, token, secondToken
    const owner = accounts[0]
    const coordinator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
        token = await JRCoin.deployed()
        secondToken = await SWCoin.deployed()
        await fundUser({ broker, user: maker, coordinator }, { jrc: 1000 })
        await broker.approveSpender(atomicBroker.address, { from: maker })
    })

    contract('test event emission', async () => {
        it('emits BalanceDecrease, BalanceIncrease, CreateSwap events', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.amount = 998
            const result = await createSwap(atomicBroker, swapParams)
            assertEventEmission(result.receipt.logs, [
                {
                    eventType: 'BalanceDecrease',
                    args: {
                        user: swapParams.maker,
                        token: swapParams.token,
                        amount: 999,
                        reason: REASON.ReasonSwapMakerGive
                    }
                },
                {
                    eventType: 'BalanceIncrease',
                    args: {
                        user: atomicBroker.address,
                        token: swapParams.token,
                        amount: 999,
                        reason: REASON.ReasonSwapHolderReceive
                    }
                },
                {
                    eventType: 'CreateSwap',
                    args: {
                        maker: swapParams.maker,
                        taker: swapParams.taker,
                        token: swapParams.token,
                        amount: swapParams.amount,
                        hashedSecret: swapParams.hashedSecret,
                        expiryTime: swapParams.expiryTime,
                        feeAsset: swapParams.feeAsset,
                        feeAmount: swapParams.feeAmount
                    }
                }
            ])
        })

        contract('when the fee asset is different from the swap token', async () => {
            it('emits BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, CreateSwap events', async () => {
                await fundUser({ broker, user: maker, coordinator }, { swc: 20 })
                const swapParams = await getSampleSwapParams({ maker, taker, token })
                swapParams.feeAsset = secondToken.address
                swapParams.feeAmount = 9
                const result = await createSwap(atomicBroker, swapParams)
                assertEventEmission(result.receipt.logs, [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: swapParams.maker,
                            token: swapParams.token,
                            amount: 999,
                            reason: REASON.ReasonSwapMakerGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.token,
                            amount: 999,
                            reason: REASON.ReasonSwapHolderReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: swapParams.maker,
                            token: swapParams.feeAsset,
                            amount: 9,
                            reason: REASON.ReasonSwapMakerFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: atomicBroker.address,
                            token: swapParams.feeAsset,
                            amount: 9,
                            reason: REASON.ReasonSwapHolderFeeReceive
                        }
                    },
                    {
                        eventType: 'CreateSwap',
                        args: {
                            maker: swapParams.maker,
                            taker: swapParams.taker,
                            token: swapParams.token,
                            amount: swapParams.amount,
                            hashedSecret: swapParams.hashedSecret,
                            expiryTime: swapParams.expiryTime,
                            feeAsset: swapParams.feeAsset,
                            feeAmount: swapParams.feeAmount
                        }
                    }
                ])
            })
        })
    })

    contract('when valid values are used', async () => {
        it('creates a swap', async () => {
            await assertTokenBalance(broker, maker, token.address, 1000)
            await assertTokenBalance(broker, atomicBroker.address, token.address, 0)

            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.amount = 998
            await createSwap(atomicBroker, swapParams)
            await assertSwapParams(atomicBroker, swapParams, swapParams.hashedSecret)

            // check that the maker's balance is reduced
            await assertTokenBalance(broker, maker, token.address, 1)
            // check that the atomicBroker's balance is increased
            await assertTokenBalance(broker, atomicBroker.address, token.address, 999)
        })
    })

    contract('when the feeAsset is different from the token', async () => {
        it('updates balances appropriately', async () => {
            await assertTokenBalance(broker, maker, token.address, 1000)
            await assertTokenBalance(broker, atomicBroker.address, token.address, 0)
            await fundUser({ broker, user: maker, coordinator }, { swc: 20 })

            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.amount = 950
            swapParams.feeAsset = secondToken.address
            swapParams.feeAmount = 9
            await createSwap(atomicBroker, swapParams)
            await assertSwapParams(atomicBroker, swapParams, swapParams.hashedSecret)

            // check that the maker's balance is reduced
            await assertTokenBalance(broker, maker, token.address, 50)
            await assertTokenBalance(broker, maker, secondToken.address, 11)
            // check that the atomicBroker's balance is increased
            await assertTokenBalance(broker, atomicBroker.address, token.address, 950)
            await assertTokenBalance(broker, atomicBroker.address, secondToken.address, 9)
        })
    })

    contract('when amount is 0', async () => {
        it('throws an error', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.amount = 0
            await assertError(createSwap, atomicBroker, swapParams)
            await assertSwapDoesNotExist(atomicBroker, swapParams.hashedSecret)
        })
    })

    contract('when expiryTime is less than current time', async () => {
        it('throws an error', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.expiryTime = 0
            await assertError(createSwap, atomicBroker, swapParams)
            await assertSwapDoesNotExist(atomicBroker, swapParams.hashedSecret)
        })
    })

    contract('when hashedSecret has been used before', async () => {
        it('throws an error', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            await createSwap(atomicBroker, swapParams)
            await assertSwapParams(atomicBroker, swapParams, swapParams.hashedSecret)

            // should fail because the hashedSecret is already used
            await fundUser({ broker, user: maker, coordinator }, { jrc: 1000 })
            await assertError(createSwap, atomicBroker, swapParams)

            // should succeed because a new hashedSecret is used
            swapParams.hashedSecret = '0x456'
            await createSwap(atomicBroker, swapParams)
            await assertSwapParams(atomicBroker, swapParams, swapParams.hashedSecret)
        })
    })

    contract('when the signature is invalid', async () => {
        it('throws an error', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            // use the coordinator as the signee
            await assertError(createSwap, atomicBroker, swapParams, undefined, coordinator)
            await assertSwapDoesNotExist(atomicBroker, swapParams.hashedSecret)
        })
    })

    contract('when the maker does not have sufficient funds for the swap amount', async () => {
        it('throws an error', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.amount = 1001
            await assertError(createSwap, atomicBroker, swapParams)
            await assertSwapDoesNotExist(atomicBroker, swapParams.hashedSecret)
        })
    })

    contract('when feeAsset == token and maker does not have sufficient funds for the fee', async () => {
        it('throws an error', async () => {
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.feeAmount = 1001
            await assertError(createSwap, atomicBroker, swapParams)
            await assertSwapDoesNotExist(atomicBroker, swapParams.hashedSecret)
        })
    })

    contract('when feeAsset != token and maker does not have sufficient funds for the fee', async () => {
        it('throws an error', async () => {
            fundUser({ broker, user: maker, coordinator }, { swc: 10 })
            const swapParams = await getSampleSwapParams({ maker, taker, token })
            swapParams.feeAsset = secondToken.address
            swapParams.feeAmount = 11

            // should fail because feeAmount is too high
            await assertError(createSwap, atomicBroker, swapParams)
            await assertSwapDoesNotExist(atomicBroker, swapParams.hashedSecret)

            // should succeed because user has sufficient funds
            swapParams.feeAmount = 10
            await createSwap(atomicBroker, swapParams)
            await assertSwapParams(atomicBroker, swapParams, swapParams.hashedSecret)
        })
    })
})
