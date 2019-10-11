const { getJrc, getSwc, getBroker, exchange, validateBalance, validateExternalBalance,
        hashOffer, assertAsync, testTradeEvents } = require('../../utils')
const { getKyberSwapExchange, fundKyberSwapExchange } = require('../../utils/kyberswapUtils')
const { ETHER_ADDR } = require('../../constants')
const { PRIVATE_KEYS } = require('../../wallets')

contract('Test networkTrade: KyberSwap', async (accounts) => {
    let jrc, swc, broker, kyberExchange
    const operator = accounts[0]
    const maker = accounts[1]
    const filler = accounts[2]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()
        kyberExchange = await getKyberSwapExchange()
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            await broker.deposit({ from: maker, value: 60 })
            await fundKyberSwapExchange(jrc, 300, 100, operator)
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
                data: 0, // index of fee-sharing wallet address in _addresses
                marketDapp: 0, // kyberswap
                takeAmount: 40
            }]
            await kyberExchange.setAmountToGive(85)
            const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })

            await testTradeEvents(result, {
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
                await fundKyberSwapExchange(jrc, 300, 100, operator)

                await validateBalance(maker, jrc, 0)
                await validateBalance(maker, ETHER_ADDR, 60)
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 0)
                await validateExternalBalance(broker, ETHER_ADDR, 60)
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(kyberExchange, jrc, 300)
                await validateExternalBalance(kyberExchange, ETHER_ADDR, 100)

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
                    data: 0, // index of fee-sharing wallet address in _addresses
                    marketDapp: 0, // kyberswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                // manually set the amount of jrc that should be given
                await kyberExchange.setAmountToGive(85)
                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)

                await validateBalance(maker, jrc, 73) // 80 jrc - 7 jrc
                await validateBalance(maker, ETHER_ADDR, 10) // 60 eth - 50 eth
                await validateBalance(operator, jrc, 12) // 7 jrc + (85 jrc - 80 jrc) = 12
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 85)
                await validateExternalBalance(broker, ETHER_ADDR, 20) // 60 eth - 40 eth
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(kyberExchange, jrc, 215) // 300 jrc - 85 jrc
                await validateExternalBalance(kyberExchange, ETHER_ADDR, 140) // 100 eth + 40 eth

                await assertAsync(broker.offers(offerHash), 10) // 50 eth - 40 eth
            })
        })
    })

    contract('when tokens are sold for ETH', async () => {
        contract('when parameters are valid', async () => {
            it('executes the trade', async () => {
                await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 100, nonce: 2 })
                await fundKyberSwapExchange(jrc, 300, 100, operator)

                await validateBalance(maker, jrc, 100)
                await validateBalance(maker, ETHER_ADDR, 0)
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, ETHER_ADDR, 0)

                await validateExternalBalance(broker, jrc, 100)
                await validateExternalBalance(broker, ETHER_ADDR, 0)
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(kyberExchange, jrc, 300)
                await validateExternalBalance(kyberExchange, ETHER_ADDR, 100)

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
                    data: 0, // index of fee-sharing wallet address in _addresses
                    marketDapp: 0, // kyberswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                // manually set the amount of eth to be given
                await kyberExchange.setAmountToGive(11)
                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)

                await validateBalance(maker, jrc, 20) // 100 jrc - 80 jrc
                await validateBalance(maker, ETHER_ADDR, 3) // 5 eth - 2 eth
                await validateBalance(operator, jrc, 0)
                await validateBalance(operator, ETHER_ADDR, 8) // 2 eth + (11 eth - 5 eth)

                // 20 jrc (maker balance) + 40 jrc (offer available amount)
                await validateExternalBalance(broker, jrc, 60)
                await validateExternalBalance(broker, ETHER_ADDR, 11) // received from uniswap
                await validateExternalBalance(maker, jrc, 0)
                await validateExternalBalance(operator, jrc, 0)
                await validateExternalBalance(kyberExchange, jrc, 340) // 300 jrc + 40 jrc
                await validateExternalBalance(kyberExchange, ETHER_ADDR, 89) // 100 eth - 11 eth

                await assertAsync(broker.offers(offerHash), 40) // 80 jrc - 40 jrc
            })
        })
    })

    contract('when the offer already exists', async () => {
        it('does not re-deduct maker funds', async () => {
            await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 500, nonce: 1 })
            await exchange.mintAndDeposit({ user: filler, token: swc, amount: 300, nonce: 2 })
            await fundKyberSwapExchange(jrc, 500, 100, operator)
            await fundKyberSwapExchange(swc, 200, 50, operator)

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
                { offerIndex: 0, fillIndex: 1, takeAmount: 40 }
            ]

            await exchange.trade(
                { operator, offers, fills, matches },
                { privateKeys }
            )

            await validateBalance(maker, jrc, 400) // 500 jrc - 100 jrc
            await validateBalance(maker, swc, 13) // 20 swc - 7 swc
            await validateBalance(filler, jrc, 37) // 40 jrc - 3 jrc
            await validateBalance(filler, swc, 280) // 300 - 20 swc
            await validateBalance(operator, jrc, 3) // received 3 jrc
            await validateBalance(operator, swc, 7) // received 7 swc

            const offerHash = hashOffer(offers[0])
            await assertAsync(broker.offers(offerHash), 60) // 100 jrc - 40 jrc

            const networkMatches = [
                {
                    offerIndex: 0,
                    surplusAssetId: swc.address,
                    data: 0, // index of fee-sharing wallet address in _addresses
                    marketDapp: 0, // kyberswap
                    takeAmount: 40
                }
            ]

            await kyberExchange.setAmountToGive(24)
            await exchange.networkTrade({ offers, matches: networkMatches, operator }, { privateKeys })

            await validateBalance(maker, jrc, 400) // unchanged
            await validateBalance(maker, swc, 33) // 13 swc + 20 swc
            await validateBalance(filler, jrc, 37) // unchanged
            await validateBalance(filler, swc, 280) // unchanged
            await validateBalance(operator, jrc, 3) // unchanged
            await validateBalance(operator, swc, 11) // received 7 swc + 4 swc

            await assertAsync(broker.offers(offerHash), 20) // 60 jrc - 40 jrc
        })
    })

    contract('when tokens are sold for another token', async () => {
        contract('when parameters are valid', async () => {
            it('executes the trade', async () => {
                await exchange.mintAndDeposit({ user: maker, token: jrc, amount: 100, nonce: 2 })
                await fundKyberSwapExchange(jrc, 500, 100, operator)
                await fundKyberSwapExchange(swc, 200, 50, operator)

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

                await validateExternalBalance(kyberExchange, jrc, 500)
                await validateExternalBalance(kyberExchange, swc, 200)
                await validateExternalBalance(kyberExchange, ETHER_ADDR, 150)

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
                    data: 0, // index of fee-sharing wallet address in _addresses
                    marketDapp: 0, // kyberswap
                    takeAmount: 40
                }]

                const offerHash = hashOffer(offers[0])
                await assertAsync(broker.offers(offerHash), 0)

                await kyberExchange.setAmountToGive(24)
                const result = await exchange.networkTrade({ offers, matches, operator }, { privateKeys })
                console.log('gas used', result.receipt.gasUsed)

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

                await validateExternalBalance(kyberExchange, jrc, 540) // 500 jrc + 40 jrc
                await validateExternalBalance(kyberExchange, swc, 176)
                await validateExternalBalance(kyberExchange, ETHER_ADDR, 150)

                await assertAsync(broker.offers(offerHash), 40) // 80 jrc - 40 jrc
            })
        })
    })
})
