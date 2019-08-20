const { getJrc, getSwc } = require('.')

async function getTradeParams(accounts) {
    const jrc = await getJrc()
    const swc = await getSwc()

    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]

    const offers = [{
        maker,
        offerAssetId: jrc.address,
        offerAmount: 100,
        wantAssetId: swc.address,
        wantAmount: 50,
        feeAssetId: swc.address,
        feeAmount: 0,
        nonce: 3
    }, {
        maker,
        offerAssetId: jrc.address,
        offerAmount: 100,
        wantAssetId: swc.address,
        wantAmount: 50,
        feeAssetId: swc.address,
        feeAmount: 0,
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
    }, {
        filler,
        offerAssetId: swc.address,
        offerAmount: 20,
        wantAssetId: jrc.address,
        wantAmount: 40,
        feeAssetId: jrc.address,
        feeAmount: 3,
        nonce: 6
    }]

    const matches = [{
        offerIndex: 0,
        fillIndex: 2,
        takeAmount: 40
    }, {
        offerIndex: 1,
        fillIndex: 3,
        takeAmount: 40
    }]

    return { operator, offers, fills, matches }
}

module.exports = {
    getTradeParams
}
