const { getBroker, getJrc, getSwc, shl, validateBalance, hashOffer,
        exchange, assertAsync } = require('../../utils')
const { PRIVATE_KEYS } = require('../../wallets')

async function touchBalances(accounts) {
    const jrc = await getJrc()
    const swc = await getSwc()

    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]

    await exchange.mintAndDeposit({ user: operator, token: jrc, amount: 1, nonce: 3 })
    await exchange.mintAndDeposit({ user: operator, token: swc, amount: 1, nonce: 4 })

    await exchange.mintAndDeposit({ user: maker, token: swc, amount: 1, nonce: 5 })
    await exchange.mintAndDeposit({ user: filler, token: jrc, amount: 1, nonce: 6 })
}

async function batchTrade(batchSize, accounts) {
    const privateKeys = PRIVATE_KEYS

    const jrc = await getJrc()
    const swc = await getSwc()

    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]

    await exchange.mintAndDeposit({ user: maker, token: jrc, amount: batchSize * 2 * 100, nonce: 1 })
    await exchange.mintAndDeposit({ user: filler, token: swc, amount: batchSize * 2 * 50, nonce: 2 })

    const offers = []
    const fills = []
    const matches = []

    for (let i = 0; i < batchSize; i++) {
        offers.push(
            {
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 10 + batchSize * 2 + i
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
            nonce: 10 + batchSize * 4 + i
        })
        matches.push({
            offerIndex: i,
            fillIndex: batchSize + i,
            takeAmount: 100
        })
    }

    const result = await exchange.trade({
        operator,
        offers,
        fills,
        matches
    }, { privateKeys })

    // console.log('gas used', result.receipt.gasUsed)
    console.log('gas used', result.receipt.gasUsed / batchSize)
}

contract('Test trade: gas costs', async (accounts) => {
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

    contract('worst-case single trade', async () => {
        it('prints gas cost', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 170, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 30, nonce: 2 })
            await assertAsync(broker.usedNonces(0), 0)

            const offer = {
                maker,
                offerAssetId: jrc.address,
                offerAmount: 100,
                wantAssetId: swc.address,
                wantAmount: 50,
                feeAssetId: swc.address,
                feeAmount: 0,
                nonce: 3
            }
            const fill = {
                filler,
                offerAssetId: swc.address,
                offerAmount: 20,
                wantAssetId: jrc.address,
                wantAmount: 40,
                feeAssetId: jrc.address,
                feeAmount: 3,
                nonce: 4
            }
            const matches = [{
                offerIndex: 0,
                fillIndex: 1,
                takeAmount: 40
            }]

            const offerHash = hashOffer(offer)
            await assertAsync(broker.offers(offerHash), 0)

            const result = await exchange.trade({
                operator,
                offers: [offer],
                fills: [fill],
                matches
            }, { privateKeys })
            console.log('gas used', result.receipt.gasUsed)

            await validateBalance(maker, jrc, 70) // 170 jrc - 100 jrc used for making offer
            await validateBalance(maker, swc, 20) // received 20 swc from filler
            await validateBalance(filler, jrc, 37) // received 40 jrc - 3 jrc for fee
            await validateBalance(filler, swc, 10) // 30 swc - 20 swc used for fill
            await validateBalance(operator, jrc, 3) // received 3 jrc for fee
            await validateBalance(operator, swc, 0) // unchanged

            // assert that remaining available offer amount is stored
            await assertAsync(broker.offers(offerHash), 60) // 60 jrc remaining, 100 jrc - 40 jrc
            // assert that all nonces have been marked as used
            await assertAsync(broker.usedNonces(0), shl(1, 3).or(shl(1, 4)))
        })
    })

    contract('sample single trade', async () => {
        it('prints gas cost', async () => {
            await batchTrade(1, accounts)
        })
    })

    contract('best-case single trade', async () => {
        it('prints gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(1, accounts)
        })
    })

    contract('best-case optimised batched trades (5 trades)', async () => {
        it('prints gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(5, accounts)
        })
    })

    contract('best-case optimised batched trades (10 trades)', async () => {
        it('prints gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(10, accounts)
        })
    })
})
