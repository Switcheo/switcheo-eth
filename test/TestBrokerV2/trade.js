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

    contract('worst-case single trade', async () => {
        it('test gas cost', async () => {
            const maker = accounts[1]
            const filler = accounts[2]

            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 1000, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            await exchange.mintAndDeposit({ user: operator, token: jrc, amount: 1, nonce: 3 })
            await exchange.mintAndDeposit({ user: operator, token: swc, amount: 1, nonce: 4 })

            const makes = [{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 11
            }]

            const fills = [{
                filler,
                offerAssetId: swc.address,
                offerAmount: 30,
                wantAssetId: jrc.address,
                wantAmount: 60,
                feeAssetId: jrc.address,
                feeAmount: 7,
                nonce: 12
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

    contract('best-case single trade', async () => {
        it('test gas cost', async () => {
            const maker = accounts[1]
            const filler = accounts[2]

            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 1000, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            await exchange.mintAndDeposit({ user: operator, token: jrc, amount: 1, nonce: 3 })
            await exchange.mintAndDeposit({ user: operator, token: swc, amount: 1, nonce: 4 })

            await exchange.mintAndDeposit({ user: maker, token: swc, amount: 1, nonce: 5 })
            await exchange.mintAndDeposit({ user: filler, token: jrc, amount: 1, nonce: 6 })

            const makes = [{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 11
            }]

            const fills = [{
                filler,
                offerAssetId: swc.address,
                offerAmount: 50,
                wantAssetId: jrc.address,
                wantAmount: 100,
                feeAssetId: jrc.address,
                feeAmount: 7,
                nonce: 12
            }]

            const result = await exchange.trade({
                makes,
                fills,
                matches: [0, 1, 100]
            }, {
                privateKeys: {
                    [maker]: getPrivateKey(maker),
                    [filler]: getPrivateKey(filler)
                }
            })

            console.log("gas used", result.receipt.gasUsed)
        })
    })

    contract('best-case batched trades', async () => {
        it('test gas cost', async () => {
            const batchSize = 5

            const maker = accounts[1]
            const filler = accounts[2]

            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: batchSize * 100, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: batchSize * 50, nonce: 2 })

            await exchange.mintAndDeposit({ user: operator, token: jrc, amount: 1, nonce: 3 })
            await exchange.mintAndDeposit({ user: operator, token: swc, amount: 1, nonce: 4 })

            await exchange.mintAndDeposit({ user: maker, token: swc, amount: 1, nonce: 5 })
            await exchange.mintAndDeposit({ user: filler, token: jrc, amount: 1, nonce: 6 })

            const makes = []
            const fills = []
            const matches = []

            for (let i = 0; i < batchSize; i++) {
                makes.push(
                    {
                        maker,
                        offerAssetId: jrc.address,
                        offerAmount: 100,
                        wantAssetId: swc.address,
                        wantAmount: 50,
                        feeAssetId: swc.address,
                        feeAmount: 2,
                        nonce: batchSize * 2 + i
                    }
                )
                fills.push({
                    filler,
                    offerAssetId: swc.address,
                    offerAmount: 50,
                    wantAssetId: jrc.address,
                    wantAmount: 100,
                    feeAssetId: jrc.address,
                    feeAmount: 7,
                    nonce: batchSize * 3 + i
                })
                matches.push(i, batchSize + i, 100)
            }

            const result = await exchange.trade({ makes, fills, matches }, {
                privateKeys: {
                    [maker]: getPrivateKey(maker),
                    [filler]: getPrivateKey(filler)
                }
            })

            console.log("gas used", result.receipt.gasUsed / batchSize)
        })
    })
})
