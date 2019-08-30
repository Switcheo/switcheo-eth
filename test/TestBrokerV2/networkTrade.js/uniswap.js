const { getJrc, getBroker, exchange, validateBalance, validateExternalBalance,
        hashOffer, assertAsync, printLogs } = require('../../utils')
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
    })

    // contract('when ETH is sold for tokens', async () => {
    //     contract('when parameters are valid', async () => {
    //         it('executes the trade', async () => {
    //             await broker.deposit({ from: maker, value: 60 })
    //             await fundUniswapExchange(jrc, 300, 100, operator)
    //
    //             await validateBalance(maker, jrc, 0)
    //             await validateBalance(maker, ETHER_ADDR, 60)
    //             await validateBalance(operator, jrc, 0)
    //             await validateBalance(operator, ETHER_ADDR, 0)
    //
    //             await validateExternalBalance(broker, jrc, 0)
    //             await validateExternalBalance(broker, ETHER_ADDR, 60)
    //             await validateExternalBalance(maker, jrc, 0)
    //             await validateExternalBalance(operator, jrc, 0)
    //             await validateExternalBalance(jrcExchange, jrc, 300)
    //             await validateExternalBalance(jrcExchange, ETHER_ADDR, 100)
    //
    //             const offers = [{
    //                 maker,
    //                 offerAssetId: ETHER_ADDR,
    //                 offerAmount: 50,
    //                 wantAssetId: jrc.address,
    //                 wantAmount: 100,
    //                 feeAssetId: jrc.address,
    //                 feeAmount: 7,
    //                 nonce: 3
    //             }]
    //             const matches = [{
    //                 offerIndex: 0,
    //                 surplusAssetId: jrc.address,
    //                 data: 60, // max execution delay
    //                 tradeProvider: 1, // uniswap
    //                 takeAmount: 40
    //             }]
    //
    //             const offerHash = hashOffer(offers[0])
    //             await assertAsync(broker.offers(offerHash), 0)
    //
    //             const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
    //             console.log('gas used', result.receipt.gasUsed)
    //
    //             /* Received amount calculations
    //              * _inputAmount = 40 eth
    //              * _inputReserve = 100 eth
    //              * _outputReserve = 300 jrc
    //              * inputAmountWithFee = _inputAmount * 997 = 40 * 997 = 39,880
    //              * numerator = inputAmountWithFee * _outputReserve = 39,880 * 300 = 11,964,000
    //              * denominator = _inputReserve * 1000 + inputAmountWithFee = 100 * 1000 + 39,880 = 139,880
    //              * tokensBought = numerator / denominator = 11,964,000 / 139,880 = 85 jrc
    //             */
    //             await validateBalance(maker, jrc, 73) // 80 jrc - 7 jrc
    //             await validateBalance(maker, ETHER_ADDR, 10) // 60 eth - 50 eth
    //             await validateBalance(operator, jrc, 12) // 7 jrc + (85 jrc - 80 jrc) = 12
    //             await validateBalance(operator, ETHER_ADDR, 0)
    //
    //             await validateExternalBalance(broker, jrc, 85)
    //             await validateExternalBalance(broker, ETHER_ADDR, 20) // 60 eth - 40 eth
    //             await validateExternalBalance(maker, jrc, 0)
    //             await validateExternalBalance(operator, jrc, 0)
    //             await validateExternalBalance(jrcExchange, jrc, 215) // 300 jrc - 85 jrc
    //             await validateExternalBalance(jrcExchange, ETHER_ADDR, 140) // 100 eth + 40 eth
    //
    //             await assertAsync(broker.offers(offerHash), 10) // 50 eth - 40 eth
    //         })
    //     })
    // })

    contract('when tokens are sold for ETH', async () => {
        contract('when parameters are valid', async () => {
            it('executes the trade', async () => {
                await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 100, nonce: 2 })
                await fundUniswapExchange(jrc, 300, 100, operator)

                await validateBalance(maker, jrc, 100)
                await validateBalance(maker, ETHER_ADDR, 0)
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 100)
                await validateExternalBalance(broker, ETHER_ADDR, 0)
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(jrcExchange, jrc, 300)
                await validateExternalBalance(jrcExchange, ETHER_ADDR, 100)

                const offers = [{
                    maker,
                    offerAssetId: jrc.address,
                    offerAmount: 80,
                    wantAssetId: ETHER_ADDR,
                    wantAmount: 10,
                    feeAssetId: ETHER_ADDR,
                    feeAmount: 2,
                    nonce: 3
                }]
                const matches = [{
                    offerIndex: 0,
                    surplusAssetId: ETHER_ADDR,
                    data: 60, // max execution delay
                    tradeProvider: 1, // uniswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)
                printLogs(result, ['Log'])

                /* Received amount calculations
                 * _inputAmount = 40 jrc
                 * _inputReserve = 300 jrc
                 * _outputReserve = 100 eth
                 * inputAmountWithFee = _inputAmount * 997 = 40 * 997 = 39,880
                 * numerator = inputAmountWithFee * _outputReserve = 39,880 * 100 = 3,988,000
                 * denominator = _inputReserve * 1000 + inputAmountWithFee = 300 * 1000 + 39,880 = 339,880
                 * tokensBought = numerator / denominator = 3,988,000 / 339,880 = 11 eth
                */
                // await validateBalance(maker, jrc, 20) // 100 jrc - 80 jrc
                // await validateBalance(maker, ETHER_ADDR, 3) // 5 eth - 2 eth
                // await validateBalance(operator, jrc, 0)
                // await validateBalance(operator, ETHER_ADDR, 8) // 2 eth + (11 eth - 5 eth)
                //
                // // 20 jrc (maker balance) + 40 jrc (offer available amount)
                // await validateExternalBalance(broker, jrc, 60)
                // await validateExternalBalance(broker, ETHER_ADDR, 11) // received from uniswap
                // await validateExternalBalance(maker, jrc, 0)
                // await validateExternalBalance(operator, jrc, 0)
                // await validateExternalBalance(jrcExchange, jrc, 340) // 300 jrc + 40 jrc
                // await validateExternalBalance(jrcExchange, ETHER_ADDR, 89) // 100 eth - 11 eth
                //
                // await assertAsync(broker.offers(offerHash), 40) // 80 jrc - 40 jrc
            })
        })
    })
})
