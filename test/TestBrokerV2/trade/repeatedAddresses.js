const { getBroker, getJrc, getSwc, validateBalance, hashOffer,
        exchange, assertAsync, replaceSubBits } = require('../../utils')

const { PRIVATE_KEYS } = require('../../wallets')

// this is not a feature test, it is a test to ensure that repeated addresses
// still result in the correct balance changes
contract('Test trade: repeated addresses', async (accounts) => {
    let broker, jrc, swc
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()
    })

    contract('when there is one offer', async () => {
        it('allows for repeated address pairs', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            const offers = [{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 7,
                nonce: 3
            }]

            const fills = [{
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 4
            }]

            const matches = [
                { offerIndex: 0, fillIndex: 1, takeAmount: 40 }
            ]

            await exchange.trade(
                { operator, offers, fills, matches },
                { privateKeys },
                ({ values, addresses }) => {
                    addresses.push(maker, jrc.address)
                    values[1] = replaceSubBits(values[1], 8, 16, (addresses.length / 2) - 1)
                }
            )

            await validateBalance(maker, jrc, 400) // 500 jrc - 100 jrc
            await validateBalance(maker, swc, 13) // 20 swc - 7 swc
            await validateBalance(filler, jrc, 37) // 40 jrc - 3 jrc
            await validateBalance(filler, swc, 280) // 300 - 20 swc
            await validateBalance(operator, jrc, 3) // received 3 jrc
            await validateBalance(operator, swc, 7) // received 7 swc

            const offerHash = hashOffer(offers[0])
            await assertAsync(broker.offers(offerHash), 60) // 100 jrc - 40 jrc
        })
    })

    contract('when there are multiple offers', async () => {
        it('allows for repeated address pair references', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

            const offers = [{
                maker,
                offerAssetId: jrc.address,
                offerAmount: 50,
                wantAssetId: swc.address,
                wantAmount: 25,
                feeAssetId: swc.address,
                feeAmount: 4,
                nonce: 3
            },
            {
                maker,
                offerAssetId: jrc.address,
                offerAmount: 50,
                wantAssetId: swc.address,
                wantAmount: 25,
                feeAssetId: swc.address,
                feeAmount: 3,
                nonce: 4
            }]

            const fills = [{
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 5
            }]

            const matches = [
                { offerIndex: 0, fillIndex: 2, takeAmount: 20 },
                { offerIndex: 1, fillIndex: 2, takeAmount: 20 }
            ]

            await exchange.trade(
                { operator, offers, fills, matches },
                { privateKeys },
                ({ values, addresses }) => {
                    addresses.push(maker, jrc.address)
                    values[1] = replaceSubBits(values[1], 8, 16, (addresses.length / 2) - 1)
                }
            )

            await validateBalance(maker, jrc, 400) // 500 jrc - 100 jrc
            await validateBalance(maker, swc, 13) // 20 swc - 7 swc
            await validateBalance(filler, jrc, 37) // 40 jrc - 3 jrc
            await validateBalance(filler, swc, 280) // 300 - 20 swc
            await validateBalance(operator, jrc, 3) // received 3 jrc
            await validateBalance(operator, swc, 7) // received 7 swc

            await assertAsync(broker.offers(hashOffer(offers[0])), 30) // 50 jrc - 20 jrc
            await assertAsync(broker.offers(hashOffer(offers[1])), 30) // 50 jrc - 20 jrc
        })
    })
})
