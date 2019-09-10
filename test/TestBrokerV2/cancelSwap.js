const { getBroker, getJrc, validateBalance, getEvmTime, increaseEvmTime,
        hashSecret, hashSwap, exchange, assertAsync, assertReversion, testEvents } = require('../utils')
const { getPrivateKey } = require('../wallets')
const { REASON_CODES } = require('../constants')

contract('Test cancelSwap', async (accounts) => {
    let broker, jrc
    const operator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]
    const privateKey = getPrivateKey(maker)
    const secret = 'highly-classified'

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        await jrc.mint(maker, 42)
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 10,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 5,
                nonce: 2
            }
            await exchange.createSwap(swap, { privateKey })
            await increaseEvmTime(601)
            const result = await exchange.cancelSwap({ ...swap, cancelFeeAmount: 2 })

            testEvents(result, [
                'BalanceIncrease',
                {
                    user: maker,
                    assetId: jrc.address,
                    amount: 8, // 10 - 2
                    reason: REASON_CODES.REASON_SWAP_CANCEL_RECEIVE,
                    nonce: 2
                },
                {
                    user: operator,
                    assetId: jrc.address,
                    amount: 2,
                    reason: REASON_CODES.REASON_SWAP_CANCEL_FEE_RECEIVE,
                    nonce: 2
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('cancels the swap', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(maker, jrc, 42)

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 10,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 5,
                nonce: 2
            }
            const swapHash = hashSwap(swap)
            await assertAsync(broker.atomicSwaps(swapHash), false)

            await exchange.createSwap(swap, { privateKey })

            await validateBalance(maker, jrc, 32)
            await validateBalance(taker, jrc, 0)
            await validateBalance(operator, jrc, 0)
            await assertAsync(broker.atomicSwaps(swapHash), true)

            await increaseEvmTime(601)
            await exchange.cancelSwap({ ...swap, cancelFeeAmount: 2 })

            await validateBalance(maker, jrc, 40) // 32 + (10 - 2)
            await validateBalance(taker, jrc, 0)
            await validateBalance(operator, jrc, 2)
            await assertAsync(broker.atomicSwaps(swapHash), false)
        })
    })

    contract('when the swap expiry time has not passed', async () => {
        it('raises an error', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 10,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 5,
                nonce: 2
            }
            await exchange.createSwap(swap, { privateKey })

            await increaseEvmTime(20)
            await assertReversion(
                exchange.cancelSwap({ ...swap, cancelFeeAmount: 2 }),
                '26'
            )
        })
    })

    contract('when the swap has already been cancelled', async () => {
        it('raises an error', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 10,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 5,
                nonce: 2
            }
            await exchange.createSwap(swap, { privateKey })

            await increaseEvmTime(601)
            await exchange.cancelSwap({ ...swap, cancelFeeAmount: 2 })

            await assertReversion(
                exchange.cancelSwap({ ...swap, cancelFeeAmount: 2 }),
                '27'
            )
        })
    })

    contract('when the cancel fee amount exceeds the fee amount', async () => {
        it('raises an error', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 10,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 5,
                nonce: 2
            }
            await exchange.createSwap(swap, { privateKey })

            await increaseEvmTime(601)
            await assertReversion(
                exchange.cancelSwap({ ...swap, cancelFeeAmount: 6 }),
                '28'
            )
        })
    })
})
