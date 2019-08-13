const { web3, getBroker, getJrc, getSwc, validateBalance, validateExternalBalance,
        getEvmTime, hashSecret, hashSwap, exchange, assertAsync } = require('../utils')
const { getPrivateKey } = require('../wallets')

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
    const jrc = await getJrc()
    const swc = await getSwc()

    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]

    await exchange.mintAndDeposit({ user: maker, token: jrc, amount: batchSize * 100, nonce: 1 })
    await exchange.mintAndDeposit({ user: filler, token: swc, amount: batchSize * 50, nonce: 2 })

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
                feeAmount: 0,
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
            nonce: batchSize * 4 + i
        })
        matches.push({
            makeIndex: i,
            fillIndex: batchSize + i,
            takeAmount: 100
        })
    }

    const result = await exchange.trade({ operator, makes, fills, matches }, {
        privateKeys: {
            [maker]: getPrivateKey(maker),
            [filler]: getPrivateKey(filler)
        }
    })

    console.log('gas used', result.receipt.gasUsed / batchSize)
    // const { v1, v2, v3, v4 } = result.receipt.logs[0].args
    // console.log('v1, v2, v3, v4', v1.toString(), v2.toString(), v3.toString(), v4.toString())
    const { logs } = result.receipt
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        const { nonce, prevNonce } = log.args
        if (nonce === undefined) { continue }
        console.log('log', nonce.toString(), prevNonce.toString())
    }
}

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
            await batchTrade(1, accounts)
        })
    })

    contract('best-case single trade', async () => {
        it('test gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(1, accounts)
        })
    })

    contract('best-case optimised batched trades (5 trades)', async () => {
        it('test gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(5, accounts)
        })
    })

    contract('best-case optimised batched trades (10 trades)', async () => {
        it('test gas cost', async () => {
            await touchBalances(accounts)
            await batchTrade(10, accounts)
        })
    })
})
