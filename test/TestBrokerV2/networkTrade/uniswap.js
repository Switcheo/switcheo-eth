const { getJrc, getSwc, getBroker, exchange, validateBalance, validateExternalBalance,
        hashOffer, assertAsync, testTradeEvents } = require('../../utils')
const { getUniswapExchange, fundUniswapExchange } = require('../../utils/uniswapUtils')
const { ETHER_ADDR } = require('../../constants')
const { PRIVATE_KEYS } = require('../../wallets')

contract('Test networkTrade: Uniswap', async (accounts) => {
    let jrc, swc, broker, jrcExchange, swcExchange
    const operator = accounts[0]
    const maker = accounts[1]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()
        jrcExchange = await getUniswapExchange(jrc)
        swcExchange = await getUniswapExchange(swc)
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            await broker.deposit({ from: maker, value: 60 })
            await fundUniswapExchange(jrc, 300, 100, operator)
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
                marketDapp: 1, // uniswap
                takeAmount: 40
            }]
            const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })

            testTradeEvents(result, {
                nonces: [3],
                increments: [
                    [maker, jrc.address, 73].join(','),
                    [operator, jrc.address, 7].join(',')
                ],
                decrements: [
                    [maker, ETHER_ADDR, 50].join(',')
                ],
                dynamicIncrements: [
                    [operator, jrc.address, 5].join(',')
                ]
            })
        })
    })

    contract('when ETH is sold for tokens', async () => {
        contract('when parameters are valid', async () => {
            it('executes the trade', async () => {
                await broker.deposit({ from: maker, value: 60 })
                await fundUniswapExchange(jrc, 300, 100, operator)

                await validateBalance(maker, jrc, 0)
                await validateBalance(maker, ETHER_ADDR, 60)
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 0)
                await validateExternalBalance(broker, ETHER_ADDR, 60)
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
                    marketDapp: 1, // uniswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)

                /* Received amount calculations
                 * _inputAmount = 40 eth
                 * _inputReserve = 100 eth
                 * _outputReserve = 300 jrc
                 * inputAmountWithFee = _inputAmount * 997 = 40 * 997 = 39,880
                 * numerator = inputAmountWithFee * _outputReserve = 39,880 * 300 = 11,964,000
                 * denominator = _inputReserve * 1000 + inputAmountWithFee = 100 * 1000 + 39,880 = 139,880
                 * tokensBought = numerator / denominator = 11,964,000 / 139,880 = 85 jrc
                */
                await validateBalance(maker, jrc, 73) // 80 jrc - 7 jrc
                await validateBalance(maker, ETHER_ADDR, 10) // 60 eth - 50 eth
                await validateBalance(operator, jrc, 12) // 7 jrc + (85 jrc - 80 jrc) = 12
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 85)
                await validateExternalBalance(broker, ETHER_ADDR, 20) // 60 eth - 40 eth
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(jrcExchange, jrc, 215) // 300 jrc - 85 jrc
                await validateExternalBalance(jrcExchange, ETHER_ADDR, 140) // 100 eth + 40 eth

                await assertAsync(broker.offers(offerHash), 10) // 50 eth - 40 eth
            })
        })
    })

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
                    marketDapp: 1, // uniswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)

                /* Received amount calculations
                 * _inputAmount = 40 jrc
                 * _inputReserve = 300 jrc
                 * _outputReserve = 100 eth
                 * inputAmountWithFee = _inputAmount * 997 = 40 * 997 = 39,880
                 * numerator = inputAmountWithFee * _outputReserve = 39,880 * 100 = 3,988,000
                 * denominator = _inputReserve * 1000 + inputAmountWithFee = 300 * 1000 + 39,880 = 339,880
                 * tokensBought = numerator / denominator = 3,988,000 / 339,880 = 11 eth
                */
                await validateBalance(maker, jrc, 20) // 100 jrc - 80 jrc
                await validateBalance(maker, ETHER_ADDR, 3) // 5 eth - 2 eth
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, ETHER_ADDR, 8) // 2 eth + (11 eth - 5 eth)

                // 20 jrc (maker balance) + 40 jrc (offer available amount)
                await validateExternalBalance(broker, jrc, 60)
                await validateExternalBalance(broker, ETHER_ADDR, 11) // received from uniswap
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(jrcExchange, jrc, 340) // 300 jrc + 40 jrc
                await validateExternalBalance(jrcExchange, ETHER_ADDR, 89) // 100 eth - 11 eth

                await assertAsync(broker.offers(offerHash), 40) // 80 jrc - 40 jrc
            })
        })
    })

    contract('when tokens are sold for another token', async () => {
        contract('when parameters are valid', async () => {
            it('executes the trade', async () => {
                await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 100, nonce: 2 })
                await fundUniswapExchange(jrc, 500, 100, operator)
                await fundUniswapExchange(swc, 200, 50, operator)

                await validateBalance(maker, jrc, 100)
                await validateBalance(maker, swc, 0)
                await validateBalance(maker, ETHER_ADDR, 0)
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, swc, 0)
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 100)
                await validateExternalBalance(broker, swc, 0)
                await validateExternalBalance(broker, ETHER_ADDR, 0)
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(maker, swc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(operator, swc, 0)

                await validateExternalBalance(jrcExchange, jrc, 500)
                await validateExternalBalance(jrcExchange, swc, 0)
                await validateExternalBalance(jrcExchange, ETHER_ADDR, 100)

                await validateExternalBalance(swcExchange, jrc, 0)
                await validateExternalBalance(swcExchange, swc, 200)
                await validateExternalBalance(swcExchange, ETHER_ADDR, 50)

                const offers = [{
                    maker,
                    offerAssetId: jrc.address,
                    offerAmount: 80,
                    wantAssetId: swc.address,
                    wantAmount: 40,
                    feeAssetId: swc.address,
                    feeAmount: 2,
                    nonce: 3
                }]
                const matches = [{
                    offerIndex: 0,
                    surplusAssetId: swc.address,
                    data: 60, // max execution delay
                    marketDapp: 1, // uniswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)

                // /* Received amount calculations
                //  * _inputAmount = 40 jrc
                //  * _inputReserve = 500 jrc
                //  * _outputReserve = 100 eth
                //  * inputAmountWithFee = _inputAmount * 997 = 40 * 997 = 39,880
                //  * numerator = inputAmountWithFee * _outputReserve = 39,880 * 100 = 3,988,000
                //  * denominator = _inputReserve * 1000 + inputAmountWithFee = 500 * 1000 + 39,880 = 539,880
                //  * ethBought = numerator / denominator = 3,988,000 / 539,880 = 7 eth
                //  *
                //  * _inputAmount = 7 eth
                //  * _inputReserve = 50 eth
                //  * _outputReserve = 200 swc
                //  * inputAmountWithFee = _inputAmount * 997 = 7 * 997 = 6,979
                //  * numerator = inputAmountWithFee * _outputReserve = 6,979 * 200 = 1,395,800
                //  * denominator = _inputReserve * 1000 + inputAmountWithFee = 50 * 1000 + 6,979 = 56,979
                //  * tokensBought = numerator / denominator = 1,395,800 / 56,979 = 24 swc
                // */
                await validateBalance(maker, jrc, 20) // 100 jrc  - 20
                await validateBalance(maker, swc, 18) // 20 swc - 2 swc
                await validateBalance(maker, ETHER_ADDR, 0)
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, swc, 6) // 2 swc + (24 swc - 20 swc)
                await validateBalance(operator, ETHER_ADDR, 0)

                // 20 jrc (maker balance) + 40 jrc (offer available amount)
                await validateExternalBalance(broker, jrc, 60)
                await validateExternalBalance(broker, swc, 24)
                await validateExternalBalance(broker, ETHER_ADDR, 0)
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(maker, swc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(operator, swc, 0)

                await validateExternalBalance(jrcExchange, jrc, 540) // 500 jrc + 40 jrc
                await validateExternalBalance(jrcExchange, swc, 0)
                await validateExternalBalance(jrcExchange, ETHER_ADDR, 100)

                await validateExternalBalance(swcExchange, jrc, 0)
                await validateExternalBalance(swcExchange, swc, 176) // 200 swc - 24 swc
                await validateExternalBalance(swcExchange, ETHER_ADDR, 50)

                await assertAsync(broker.offers(offerHash), 40) // 80 jrc - 40 jrc
            })
        })
    })
})
