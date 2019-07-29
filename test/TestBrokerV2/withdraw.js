const { web3, getBroker, getJrc, createNonce, validateBalance,
        validateExternalBalance, exchange } = require('../utils')

contract('Test withdraw', async (accounts) => {
    let broker, jrc
    const user = '0x6CF202982Ed0823157FE1e30e8e6DA6353Cb0636'
    const privateKey = '220b549fb616e6182061da424b5d906efa17f897fb3962fb2fe7cb0cec33bb59'

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        await jrc.mint(user, 42)
    })

    it('withdraws amount to user', async () => {
        const nonce = createNonce()
        await exchange.depositToken({ user, token: jrc, amount: 42 })
        await validateBalance(user, jrc, 42)
        await exchange.withdraw({
            user,
            assetId: jrc,
            amount: 42,
            feeAssetId: jrc,
            feeAmount: 2,
            nonce
        }, { privateKey })
    })
})
