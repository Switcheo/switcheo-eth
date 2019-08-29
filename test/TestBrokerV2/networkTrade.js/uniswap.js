const { getJrc, getBroker, exchange, validateBalance, validateExternalBalance, printLogs } = require('../../utils')
const { getUniswapExchange, fundUniswapExchange } = require('../../utils/uniswapUtils')
const { ETHER_ADDR } = require('../../constants')
const { PRIVATE_KEYS } = require('../../wallets')

contract('Test networkTrade: uniswap', async (accounts) => {
    let jrc, broker, jrcExchange
    const operator = accounts[0]
    const maker = accounts[1]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        jrcExchange = await getUniswapExchange(jrc)
        await broker.deposit({ from: maker, value: 60 })
    })

    contract('when parameters are valid', async () => {
        it('performs a network trade', async () => {
            await fundUniswapExchange(jrc, 300, 100, operator)

            await validateExternalBalance(broker, jrc, 0)
            await validateExternalBalance(maker, jrc, 0)
            await validateExternalBalance(operator, jrc, 0)
            await validateExternalBalance(jrcExchange, jrc, 300)
            await validateExternalBalance(jrcExchange, ETHER_ADDR, 100)

            const offers = [{
                maker,
                offerAssetId: ETHER_ADDR,
                offerAmount: 50,
                wantAssetId: jrc.address,
                wantAmount: 100,
                feeAssetId: jrc.address,
                feeAmount: 7,
                nonce: 3
            }]
            const matches = [{
                offerIndex: 0,
                surplusAssetId: jrc.address,
                data: 60, // max execution delay
                tradeProvider: 1, // uniswap
                takeAmount: 40
            }]

            const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
            console.log('gas used', result.receipt.gasUsed)
            printLogs(result, ['Log'])

            await validateBalance(maker, jrc, 73) // 80 jrc - 7 jrc
            // await validateBalance(operator, jrc, 60) //
            // await validateExternalBalance(broker, jrc, 60)
            // await validateExternalBalance(maker, jrc, 0)
            // await validateExternalBalance(operator, jrc, 0)
            // await validateExternalBalance(jrcExchange, jrc, 300)
            // await validateExternalBalance(jrcExchange, ETHER_ADDR, 100)
        })
    })
})
