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

    // console.log('operator', operator)
    // console.log('maker', maker)
    // console.log('filler', filler)
    // console.log('jrc', jrc.address)
    // console.log('swc', swc.address)

    // console.log('gas used', result.receipt.gasUsed)
    console.log('gas used', result.receipt.gasUsed / batchSize)

    const { logs } = result.receipt
    const events = ['Log', 'Log2', 'Log3', 'LogSig']

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        let print = false
        for (let j = 0; j < events.length; j++) {
            if (log.event === events[j]) {
                print = true
                break
            }
        }

        if (print) {
            const values = {}
            for (const key in log.args) {
                if (key === '__length__') { continue }
                if (key === '0') { continue }
                if (!isNaN(parseInt(key))) { continue }

                values[key] = log.args[key]
                if (values[key].toString !== undefined) {
                    values[key] = values[key].toString()
                }
            }
            console.log('log', log.event, values)
        }
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
