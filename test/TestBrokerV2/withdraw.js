const { getBroker, getJrc, validateBalance, validateExternalBalance,
        exchange, assertReversion } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test withdraw', async (accounts) => {
    let broker, jrc
    const operator = accounts[0]
    const user = accounts[1]
    const receivingAddress = accounts[2]
    const privateKey = getPrivateKey(user)

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        await jrc.mint(user, 42)
    })

    contract('when parameters are valid', async () => {
        it('withdraws amount to user', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(receivingAddress, jrc, 0)

            await exchange.withdraw({
                user,
                receivingAddress,
                assetId: jrc,
                amount: 42,
                feeAssetId: jrc,
                feeAmount: 2,
                nonce: 2
            }, { privateKey })

            await validateBalance(user, jrc, 0)
            await validateBalance(operator, jrc, 2)
            await validateExternalBalance(user, jrc, 0)
            await validateExternalBalance(receivingAddress, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)
        })
    })

    contract('when the nonce has been used before', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(receivingAddress, jrc, 0)

            await exchange.withdraw({
                user,
                receivingAddress,
                assetId: jrc,
                amount: 42,
                feeAssetId: jrc,
                feeAmount: 2,
                nonce: 2
            }, { privateKey })

            await validateBalance(user, jrc, 0)
            await validateBalance(operator, jrc, 2)
            await validateExternalBalance(user, jrc, 0)
            await validateExternalBalance(receivingAddress, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)

            await assertReversion(
                exchange.withdraw({
                    user,
                    receivingAddress,
                    assetId: jrc,
                    amount: 42,
                    feeAssetId: jrc,
                    feeAmount: 2,
                    nonce: 2
                }, { privateKey }),
                '36'
            )

            await validateBalance(user, jrc, 0)
            await validateBalance(operator, jrc, 2)
            await validateExternalBalance(user, jrc, 0)
            await validateExternalBalance(receivingAddress, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)
        })
    })

    contract('when the signature is invalid', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(receivingAddress, jrc, 0)

            await assertReversion(
                exchange.withdraw({
                    user,
                    receivingAddress,
                    assetId: jrc,
                    amount: 42,
                    feeAssetId: jrc,
                    feeAmount: 2,
                    nonce: 2
                }, { privateKey: getPrivateKey(receivingAddress) }),
                'Invalid signature'
            )
        })
    })

    contract('when the withdraw amount is larger than the user\'s available balance', async () => {
        it('raises an error', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(receivingAddress, jrc, 0)

            await assertReversion(
                exchange.withdraw({
                    user,
                    receivingAddress,
                    assetId: jrc,
                    amount: 43,
                    feeAssetId: jrc,
                    feeAmount: 2,
                    nonce: 2
                }, { privateKey }),
                'subtraction overflow'
            )
        })
    })
})
