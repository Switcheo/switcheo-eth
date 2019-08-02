const { web3, getBroker, getJrc, getSwc, validateBalance, validateExternalBalance,
        getEvmTime, hashSecret, hashSwap, exchange, assertAsync } = require('../utils')
const { getPrivateKey } = require('../wallets')

contract('Test trade', async (accounts) => {
    let broker, jrc, swc
    const operator = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()
    })

    contract('when parameters are valid', async () => {
        it('executes a trade', async () => {
            const maker = accounts[1]
            const filler = accounts[2]

            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 100, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 30, nonce: 2 })

            await validateBalance(maker, jrc, 100)
            await validateBalance(filler, swc, 30)

            const makes = [{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 2,
                nonce: 3
            }]

            const fills = [{
                filler,
                offerAssetId: swc.address,
                offerAmount: 30,
                wantAssetId: jrc.address,
                wantAmount: 60,
                feeAssetId: jrc.address,
                feeAmount: 7,
                nonce: 4
            }]

            await exchange.trade({
                makes,
                fills,
                matches: [0, 1, 60]
            }, {
                privateKeys: {
                    [maker]: getPrivateKey(maker),
                    [filler]: getPrivateKey(filler)
                }
            })
        })
    })
})
