const { getBroker, getJrc, validateBalance, getEvmTime, hashSecret, hashSwap,
        exchange, assertAsync, assertReversion, testEvents } = require('../utils')
const { getPrivateKey } = require('../wallets')
const { REASON_CODES } = require('../constants')

contract('Test createSwap', async (accounts) => {
    let broker, jrc
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
                feeAmount: 2,
                nonce: 2
            }

            const result = await exchange.createSwap(swap, { privateKey })

            testEvents(result, [
                'BalanceDecrease',
                {
                    user: maker,
                    assetId: jrc.address,
                    amount: 10,
                    reason: REASON_CODES.REASON_SWAP_GIVE,
                    nonce: 2
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('creates a swap', async () => {
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
                feeAmount: 2,
                nonce: 2
            }
            const swapHash = hashSwap(swap)
            await assertAsync(broker.atomicSwaps(swapHash), false)

            const result = await exchange.createSwap(swap, { privateKey })
            console.log('gas used', result.receipt.gasUsed)

            await validateBalance(maker, jrc, 32)
            await assertAsync(broker.atomicSwaps(swapHash), true)
        })
    })

    contract('when the swap amount is 0', async () => {
        it('raises an error', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(maker, jrc, 42)

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 0,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 2,
                nonce: 2
            }
            const swapHash = hashSwap(swap)
            await assertAsync(broker.atomicSwaps(swapHash), false)

            await assertReversion(
                exchange.createSwap(swap, { privateKey }),
                '20'
            )

            await validateBalance(maker, jrc, 42)
            await assertAsync(broker.atomicSwaps(swapHash), false)
        })
    })

    contract('when the swap expriy time has passed', async () => {
        it('raises an error', async () => {
            const expiryTime = (await getEvmTime()) - 10
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
                feeAmount: 2,
                nonce: 2
            }
            const swapHash = hashSwap(swap)
            await assertAsync(broker.atomicSwaps(swapHash), false)

            await assertReversion(
                exchange.createSwap(swap, { privateKey }),
                '21'
            )

            await validateBalance(maker, jrc, 42)
            await assertAsync(broker.atomicSwaps(swapHash), false)
        })
    })

    contract('when the swap is already active', async () => {
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
                feeAmount: 2,
                nonce: 2
            }

            await exchange.createSwap(swap, { privateKey })

            await assertReversion(
                exchange.createSwap(swap, { privateKey }),
                '22'
            )
        })
    })

    contract('when the nonce has already been used', async () => {
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
                feeAmount: 2,
                nonce: 2
            }

            await exchange.createSwap(swap, { privateKey })

            swap.amount = 12
            await assertReversion(
                exchange.createSwap(swap, { privateKey }),
                '36'
            )
        })
    })

    contract('when the fee amount exceeds the swap amount', async () => {
        it('raises an error', async () => {
            const expiryTime = (await getEvmTime()) + 600
            await exchange.depositToken({ user: maker, token: jrc, amount: 42, nonce: 1 })

            const swap = {
                maker,
                taker,
                assetId: jrc,
                amount: 2,
                hashedSecret: hashSecret(secret),
                expiryTime,
                feeAssetId: jrc,
                feeAmount: 3,
                nonce: 2
            }

            await assertReversion(
                exchange.createSwap(swap, { privateKey }),
                '23'
            )
        })
    })
})
