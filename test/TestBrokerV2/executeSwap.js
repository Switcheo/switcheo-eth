const { getBroker, getJrc, validateBalance, getEvmTime, hashSecret, hashSwap,
        exchange, assertAsync } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test executeSwap', async (accounts) => {
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
})
