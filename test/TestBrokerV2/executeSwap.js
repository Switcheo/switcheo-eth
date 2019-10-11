const { getBroker, getJrc, validateBalance, getEvmTime, hashSecret, hashSwap,
        exchange, assertAsync, assertReversion, testEvents } = require('../utils')
const { getPrivateKey } = require('../wallets')
const { REASON_CODES } = require('../constants')

contract('Test executeSwap', async (accounts) => {
    let broker, jrc
    const operator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]
    const privateKey = getPrivateKey(maker)
    const secret = '79863f597f584e08ae9e34eeea2c134979863f597f584e08ae9e34eeea2c1349'

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
            await exchange.createSwap(swap, { privateKey })
            const result = await exchange.executeSwap({ ...swap, secret })

            testEvents(result, [
                'BalanceIncrease',
                {
                    user: taker,
                    assetId: jrc.address,
                    amount: 8, // 10 - 2
                    reason: REASON_CODES.REASON_SWAP_RECEIVE,
                    nonce: 2
                },
                'BalanceIncrease',
                {
                    user: operator,
                    assetId: jrc.address,
                    amount: 2,
                    reason: REASON_CODES.REASON_SWAP_FEE_RECEIVE,
                    nonce: 2
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('executes the swap', async () => {
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

            await exchange.createSwap(swap, { privateKey })

            await validateBalance(maker, jrc, 32)
            await validateBalance(taker, jrc, 0)
            await validateBalance(operator, jrc, 0)
            await assertAsync(broker.atomicSwaps(swapHash), true)

            const result = await exchange.executeSwap({ ...swap, secret })
            console.log('gas used', result.receipt.gasUsed)

            await validateBalance(maker, jrc, 32)
            await validateBalance(taker, jrc, 8)
            await validateBalance(operator, jrc, 2)
            await assertAsync(broker.atomicSwaps(swapHash), false)
        })
    })

    contract('when the swap has already been executed', async () => {
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
            await exchange.executeSwap({ ...swap, secret })

            await assertReversion(
                exchange.executeSwap({ ...swap, secret }),
                '24'
            )
        })
    })

    contract('when the hash of the preimage does not match the hash secret', async () => {
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
                exchange.executeSwap({ ...swap, secret: '123' }),
                '25'
            )
        })
    })
})
