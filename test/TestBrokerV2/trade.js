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

            const result = await exchange.trade({
                makes,
                fills,
                matches: [0, 1, 60]
            }, {
                privateKeys: {
                    [maker]: getPrivateKey(maker),
                    [filler]: getPrivateKey(filler)
                }
            })
            console.log("gas used", result.receipt.gasUsed)
        })
    })

    contract('test gas cost for batched trades', async () => {
        it('executes trades', async () => {
            const maker = accounts[1]
            const filler = accounts[2]

            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 1000, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            const makes = []
            const fills = []
            const matches = []
            const count = 10

            for (let i = 0; i < count; i++) {
                makes.push(
                    {
                        maker,
                        offerAssetId: jrc.address,
                        offerAmount: 100,
                        wantAssetId: swc.address,
                        wantAmount: 50,
                        feeAssetId: swc.address,
                        feeAmount: 2,
                        nonce: count + i
                    }
                )
                fills.push({
                    filler,
                    offerAssetId: swc.address,
                    offerAmount: 30,
                    wantAssetId: jrc.address,
                    wantAmount: 60,
                    feeAssetId: jrc.address,
                    feeAmount: 7,
                    nonce: count * 2 + i
                })
                matches.push(i, count + i, 60)
            }

            const result = await exchange.trade({ makes, fills, matches }, {
                privateKeys: {
                    [maker]: getPrivateKey(maker),
                    [filler]: getPrivateKey(filler)
                }
            })
            console.log("gas used", result.receipt.gasUsed)
        })
    })
})
