const { getBroker, getJrc, validateBalance, exchange } = require('../utils')
const { getKyberSwapExchange } = require('../utils/kyberswapUtils')
const { ETHER_ADDR } = require('../constants')
const { getPrivateKey } = require('../wallets')

contract('Test claimExcessBalance', async (accounts) => {
    let broker, jrc, kyberExchange
    const owner = accounts[0]
    const user = accounts[1]
    const privateKey = getPrivateKey(user)

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        kyberExchange = await getKyberSwapExchange()

        await broker.deposit({ from: user, value: 1000 })
        await exchange.mintAndDeposit({ user: user, token: jrc, amount: 500, nonce: 1 })

        await validateBalance(user, ETHER_ADDR, 1000)
        await validateBalance(user, jrc, 500)
    })

    contract('when there is excess balance', async () => {
        it('transfers the excess balance to the owner', async () => {
            // manually transfer funds into the Broker contract
            // without using the proper deposit methods
            await kyberExchange.forwardDeposit(broker.address, {
                from: user,
                value: 150
            })
            await jrc.mint(user, 100)
            await jrc.transfer(broker.address, 100, { from: user })

            await exchange.withdraw({
                user,
                receivingAddress: user,
                assetId: ETHER_ADDR,
                amount: 300,
                feeAssetId: ETHER_ADDR,
                feeAmount: 0,
                nonce: 2
            }, { privateKey })

            await exchange.withdraw({
                user,
                receivingAddress: user,
                assetId: jrc,
                amount: 200,
                feeAssetId: jrc,
                feeAmount: 0,
                nonce: 3
            }, { privateKey })

            await validateBalance(user, ETHER_ADDR, 700) // 1000 - 300
            await validateBalance(user, jrc, 300) // 500 - 200

            await validateBalance(owner, ETHER_ADDR, 0)
            await validateBalance(owner, jrc, 0)

            await broker.claimExcessBalance(ETHER_ADDR)
            await validateBalance(owner, ETHER_ADDR, 150)

            await broker.claimExcessBalance(jrc.address)
            await validateBalance(owner, jrc, 100)
        })
    })
})
