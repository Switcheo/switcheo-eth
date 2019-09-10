const { getBroker, getJrc, getSwc, bn, shl, clone, exchange,
        assertReversion } = require('../../utils')

const { getKyberSwapExchange, fundKyberSwapExchange } = require('../../utils/kyberswapUtils')
const { PRIVATE_KEYS } = require('../../wallets')
const { ZERO_ADDR, ETHER_ADDR } = require('../../constants')

contract('Test networkTrade: general validations', async (accounts) => {
    let broker, kyberExchange, jrc, swc, tradeParams
    const operator = accounts[0]
    const maker = accounts[1]
    const privateKeys = PRIVATE_KEYS

    beforeEach(async () => {
        broker = await getBroker()
        kyberExchange = await getKyberSwapExchange()
        jrc = await getJrc()
        swc = await getSwc()

        await broker.deposit({ from: maker, value: 60 })
        await fundKyberSwapExchange(jrc, 300, 100, operator)

        offers = [{
            maker,
            offerAssetId: ETHER_ADDR,
            offerAmount: 50,
            wantAssetId: jrc.address,
            wantAmount: 100,
            feeAssetId: jrc.address,
            feeAmount: 7,
            nonce: 3
        }, {
            maker,
            offerAssetId: ETHER_ADDR,
            offerAmount: 50,
            wantAssetId: jrc.address,
            wantAmount: 100,
            feeAssetId: jrc.address,
            feeAmount: 7,
            nonce: 4
        }]
        matches = [{
            offerIndex: 0,
            surplusAssetId: jrc.address,
            data: 0, // index of fee-sharing wallet address in _addresses
            marketDapp: 0, // kyberswap
            takeAmount: 40
        }, {
            offerIndex: 1,
            surplusAssetId: jrc.address,
            data: 0, // index of fee-sharing wallet address in _addresses
            marketDapp: 0, // kyberswap
            takeAmount: 40
        }]

        await kyberExchange.setAmountToGive(85)

        tradeParams = { offers, matches, operator }
    })

    contract('when numOffers is 0', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ values }) => { values[0] = bn(0).or(shl(0, 8)).or(shl(2, 16)) }
                ),
                'Invalid networkTrade input'
            )
        })
    })

    contract('when numFills is not 0', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ values }) => { values[0] = bn(2).or(shl(1, 8)).or(shl(2, 16)) }
                ),
                'Invalid networkTrade input'
            )
        })
    })

    contract('when numMatches is 0', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ values }) => { values[0] = bn(2).or(shl(1, 8)).or(shl(0, 16)) }
                ),
                'Invalid networkTrade input'
            )
        })
    })

    contract('when _values[0] has additional non-zero bits', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ values }) => { values[0] = bn(2).or(shl(0, 8)).or(shl(2, 16)).or(shl(1, 30)) }
                ),
                'Invalid networkTrade input'
            )
        })
    })


    contract('when _values.length does not match number of offers and fills', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ values }) => { values.push(1) }
                ),
                'Invalid _values.length'
            )
        })
    })
   //
    contract('when _hashes.length does not match number of offers and fills', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ hashes }) => { hashes.push(ZERO_ADDR) }
                ),
                'Invalid _hashes.length'
            )
        })
    })

    contract('when offers are not unique', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[0].nonce = 4

            await assertReversion(
                exchange.networkTrade(
                    editedTradeParams,
                    { privateKeys }
                ),
                'Invalid offer nonces'
            )
        })
    })

    contract('when offer nonces are not sorted in ascending order', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[0].nonce = 20

            await assertReversion(
                exchange.networkTrade(
                    editedTradeParams,
                    { privateKeys }
                ),
                'Invalid offer nonces'
            )
        })
    })

    contract('when a match.offerIndex >= numOffers', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].offerIndex = 2

            await assertReversion(
                exchange.networkTrade(
                    editedTradeParams,
                    { privateKeys }
                ),
                'Invalid match.offerIndex'
            )
        })
    })

    contract('when match.takeAmount is 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.matches[1].takeAmount = 0

            await assertReversion(
                exchange.networkTrade(
                    editedTradeParams,
                    { privateKeys }
                ),
                'Invalid match.takeAmount'
            )
        })
    })

    contract('when (offer.wantAmount * takeAmount) % offer.offerAmount != 0', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].wantAmount = 33

            await assertReversion(
                exchange.networkTrade(
                    editedTradeParams,
                    { privateKeys }
                ),
                'Invalid amounts'
            )
        })
    })

    contract('when offer signatures are not valid', async () => {
        it('raises an error', async () => {
            await assertReversion(
                exchange.networkTrade(
                    tradeParams,
                    { privateKeys },
                    ({ hashes }) => { hashes[3] = ZERO_ADDR }
                ),
                'Invalid signature'
            )
        })
    })

    contract('when offer.offerAssetId == offer.wantAssetId', async () => {
        it('raises an error', async () => {
            const editedTradeParams = clone(tradeParams)
            editedTradeParams.offers[1].wantAssetId = ETHER_ADDR

            await assertReversion(
                exchange.networkTrade(
                    editedTradeParams,
                    { privateKeys }
                ),
                'Invalid trade assets'
            )
        })
    })

    contract('when the operator address is not set to the operator address', async () => {
       it('raises an error', async () => {
           await assertReversion(
               exchange.networkTrade(
                   tradeParams,
                   { privateKeys },
                   ({ addresses }) => {
                       for (let i = 0; i < addresses.length; i += 2) {
                           if (addresses[i] == operator) {
                               addresses[i] = ZERO_ADDR
                               break
                           }
                       }
                   }
               ),
               'Invalid operator address'
           )
       })
   })

    contract('when the operator\'s fee asset ID is not set to the maker fee asset ID', async () => {
       it('raises an error', async () => {
           await assertReversion(
               exchange.networkTrade(
                   tradeParams,
                   { privateKeys },
                   ({ addresses }) => {
                       for (let i = 0; i < addresses.length; i += 2) {
                           if (addresses[i] == operator) {
                               addresses[i + 1] = swc.address
                               break
                           }
                       }
                   }
               ),
               'Invalid operator fee asset ID'
           )
       })
   })

   //  contract('when an offer.nonce is already used', async () => {
   //      it('raises an error', async () => {
   //          const editedTradeParams = clone(tradeParams)
   //          editedTradeParams.offers[0].nonce = 1
   //
   //          // nonce 1 has already been used by a deposit transaction
   //          // so the nonce will be found to be taken and the contract will
   //          // use offers[offerHash] as the availableAmount
   //          // this will be 0, causing error 31 to be thrown
   //          await assertReversion(
   //              exchange.trade(
   //                  editedTradeParams,
   //                  { privateKeys }
   //              ),
   //              '31'
   //          )
   //      })
   //  })
   //
   //  contract('when an offer.nonce is the same as a fill.nonce', async () => {
   //      it('raises an error', async () => {
   //          const editedTradeParams = clone(tradeParams)
   //          editedTradeParams.offers[1].nonce = editedTradeParams.fills[0].nonce
   //          await assertReversion(
   //              exchange.trade(
   //                  editedTradeParams,
   //                  { privateKeys }
   //              ),
   //              '36'
   //          )
   //      })
   //  })
   //
   //  contract('when fill nonces are not unique', async () => {
   //      it('raises an error', async () => {
   //          const editedTradeParams = clone(tradeParams)
   //          editedTradeParams.fills[0].nonce = 6
   //
   //          await assertReversion(
   //              exchange.trade(
   //                  editedTradeParams,
   //                  { privateKeys }
   //              ),
   //              '36'
   //          )
   //      })
   //  })
})
