const { getBroker, getJrc, getSwc, validateBalance, hashOffer, exchange, assertAsync } = require('../../utils')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test trade: repeated matches', async (accounts) => {
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

    // this is not a feature test, it is a test to ensure that repeated matches
    // between the same offers and fills still give a correct result
    it('allows for repeated matches between the same offers and fills', async () => {
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
            { offerIndex: 0, fillIndex: 1, takeAmount: 20 },
            { offerIndex: 0, fillIndex: 1, takeAmount: 20 }
        ]
        await exchange.trade({ operator, offers, fills, matches }, { privateKeys })

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
