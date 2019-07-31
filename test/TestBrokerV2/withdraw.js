const { web3, getBroker, getJrc, validateBalance,
        validateExternalBalance, exchange } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test withdraw', async (accounts) => {
    let broker, jrc
    const operator = accounts[0]
    const user = accounts[1]
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
            await exchange.withdraw({
                user,
                assetId: jrc,
                amount: 42,
                feeAssetId: jrc,
                feeAmount: 2,
                nonce: 2
            }, { privateKey })
            await validateBalance(user, jrc, 0)
            await validateBalance(operator, jrc, 2)
            await validateExternalBalance(user, jrc, 40)
            await validateExternalBalance(broker, jrc, 2)
        })
    })
})
