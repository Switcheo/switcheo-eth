const { getBroker, getJrc, getSwc, hashOffer, exchange, assertAsync } = require('../../utils')

const { PRIVATE_KEYS } = require('../../wallets')

contract('Test trade: unmatched offer', async (accounts) => {
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

    // this is not a feature test, it is a test to ensure that unmatched offers
    // will still have their available offer amounts stored
    it('updates broker.offers with the offer\'s available amount', async () => {
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
            offerAmount: 20,
            wantAssetId: jrc.address,
            wantAmount: 40,
            feeAssetId: jrc.address,
            feeAmount: 3,
            nonce: 5
        }]

        const matches = [{ offerIndex: 0, fillIndex: 2, takeAmount: 40 }]
        await exchange.trade({ operator, offers, fills, matches }, { privateKeys })

        const offerHash1 = hashOffer(offers[0])
        const offerHash2 = hashOffer(offers[1])
        await assertAsync(broker.offers(offerHash1), 60) // 100 jrc - 40 jrc
        await assertAsync(broker.offers(offerHash2), 100)
    })
})
