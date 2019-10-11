const { getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange, assertAsync } = require('../../utils')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test trade: one fill many offers', async (accounts) => {
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

    it('correctly updates contract state', async () => {
        await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
        await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })

        const offers = [{
            maker,
            offerAssetId: jrc.address,
            offerAmount: 19,
            wantAssetId: swc.address,
            wantAmount: 11,
            feeAssetId: swc.address,
            feeAmount: 1,
            nonce: 3
        }, {
            maker,
            offerAssetId: jrc.address,
            offerAmount: 100,
            wantAssetId: swc.address,
            wantAmount: 50,
            feeAssetId: swc.address,
            feeAmount: 7,
            nonce: 4
        }]

        const fills = [{
            filler,
            offerAssetId: swc.address,
            offerAmount: 11 + 20,
            wantAssetId: jrc.address,
            wantAmount: 19 + 40,
            feeAssetId: jrc.address,
            feeAmount: 3,
            nonce: 5
        }]

        const matches = [
            { offerIndex: 0, fillIndex: 2, takeAmount: 19 },
            { offerIndex: 1, fillIndex: 2, takeAmount: 40 }
        ]
        const result = await exchange.trade({ operator, offers, fills, matches }, { privateKeys })
        console.log('gas used', result.receipt.gasUsed / 2)

        await validateBalance(maker, jrc, 381) // 500 jrc - 100 jrc - 19 jrc
        await validateBalance(maker, swc, 23) // 20 swc + 11 swc - 7 swc - 1 swc
        await validateBalance(filler, jrc, 56) // 59 jrc - 3 jrc
        await validateBalance(filler, swc, 269) // 300 swc - 20 swc - 11 swc
        await validateBalance(operator, jrc, 3) // received 3 jrc
        await validateBalance(operator, swc, 8) // received 7 swc + 1 swc

        const offerHash1 = hashOffer(offers[0])
        const offerHash2 = hashOffer(offers[1])
        await assertAsync(broker.offers(offerHash1), 0) //
        await assertAsync(broker.offers(offerHash2), 60) // 100 jrc - 40 jrc
    })
})
