const { getBroker, getJrc, validateBalance, validateExternalBalance,
        exchange, assertReversion, testEvents } = require('../utils')
const { getPrivateKey } = require('../wallets')
const { REASON_CODES } = require('../constants')

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

    contract('test event emission', async () => {
        it('emits events', async () => {
            await exchange.depositToken({ user, token: jrc, amount: 42, nonce: 1 })
            await validateBalance(user, jrc, 42)
            await validateExternalBalance(receivingAddress, jrc, 0)

            const result = await exchange.withdraw({
                user,
                receivingAddress,
                assetId: jrc,
                amount: 42,
                feeAssetId: jrc,
                feeAmount: 2,
                nonce: 2
            }, { privateKey })

            testEvents(result, [
                'BalanceDecrease',
                {
                    user: user,
                    assetId: jrc.address,
                    amount: 42,
                    reason: REASON_CODES.REASON_WITHDRAW,
                    nonce: 2
                },
                'BalanceIncrease',
                {
                    user: operator,
                    assetId: jrc.address,
                    amount: 2,
                    reason: REASON_CODES.REASON_WITHDRAW_FEE_RECEIVE,
                    nonce: 2
                },
                'Transfer',
                {
                    from: broker.address,
                    to: receivingAddress,
                    value: 40
                }
            ])
        })
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
