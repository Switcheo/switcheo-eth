const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR, REASON, nonceGenerator, getValidOfferParams, assertError,
    assertOfferParams, assertTokenBalance, assertEtherBalance, assertEventEmission,
    assertOfferDoesNotExist, makeOffer, signMakeOffer, signCancel, getOfferHash } = require('./helpers')

contract('Test makeOffer', async () => {
    let broker, token, user, initialEtherBalance, accounts, coordinator
    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    beforeEach(async () => {
        broker = await Broker.deployed()
        token = await JRCoin.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        operator = accounts[0]
        user = accounts[1]
        await broker.depositEther.sendTransaction({ from: user, value: web3.utils.toWei('1', 'ether') })
        initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(initialEtherBalance, '1000000000000000000')

        await token.mint.sendTransaction(user, '100')
        await token.approve.sendTransaction(broker.address, '100',  { from: user })
        await broker.depositERC20.sendTransaction(user, token.address,'100', { from: coordinator })
    })

    contract('test event emission', async () => {
        contract('when there are no fees', async () => {
            it('emits BalanceDecrease and Make events', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                const offerHash = getOfferHash(params)
                const signature = await signMakeOffer(params)
                const { v, r, s } = signature
                const { logs } = await broker.makeOffer(params.maker, params.offerAsset, params.wantAsset,
                    params.offerAmount, params.wantAmount, params.feeAsset, params.feeAmount, params.nonce, v, r, s)
                assertEventEmission(logs, [{
                    eventType: 'BalanceDecrease',
                    args: {
                        user: user.toLowerCase(),
                        token: ETHER_ADDR,
                        amount: '999999999999999999',
                        reason: REASON.ReasonMakerGive
                    }
                }, {
                    eventType: 'Make',
                    args: {
                        maker: user.toLowerCase(),
                        offerHash: offerHash
                    }
                }])
            })
        })

        contract('when the fee asset is the same as the offerAsset', async () => {
            it('emits BalanceDecrease, BalanceIncrease and Make events', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                params.offerAsset = ETHER_ADDR
                params.offerAmount = 100
                params.feeAsset = ETHER_ADDR
                params.feeAmount = 20
                const offerHash = getOfferHash(params)
                const signature = await signMakeOffer(params)
                const { v, r, s } = signature
                const { logs } = await broker.makeOffer(params.maker, params.offerAsset, params.wantAsset,
                    params.offerAmount, params.wantAmount, params.feeAsset, params.feeAmount, params.nonce, v, r, s)
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '120',
                            reason: REASON.ReasonMakerGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '20',
                            reason: REASON.ReasonMakerFeeReceive
                        }
                    },
                    {
                        eventType: 'Make',
                        args: {
                            maker: user.toLowerCase(),
                            offerHash: offerHash
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })

        contract('when the fee asset is different from the offerAsset', async () => {
            it('emits BalanceDecrease, BalanceDecrease, BalanceIncrease and Make events', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                params.offerAsset = ETHER_ADDR
                params.offerAmount = 100
                params.feeAsset = token.address
                params.feeAmount = 7
                const offerHash = getOfferHash(params)
                const signature = await signMakeOffer(params)
                const { v, r, s } = signature
                const { logs } = await broker.makeOffer(params.maker, params.offerAsset, params.wantAsset,
                    params.offerAmount, params.wantAmount, params.feeAsset, params.feeAmount, params.nonce, v, r, s)
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '100',
                            reason: REASON.ReasonMakerGive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user.toLowerCase(),
                            token: token.address,
                            amount: '7',
                            reason: REASON.ReasonMakerFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: token.address,
                            amount: '7',
                            reason: REASON.ReasonMakerFeeReceive
                        }
                    },
                    {
                        eventType: 'Make',
                        args: {
                            maker: user.toLowerCase(),
                            offerHash: offerHash
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })

        })
    })

    contract('test fees', async () => {
        contract('when the fee asset is the same as the offerAsset', async () => {
            it('updates balances appropriately', async () => {
                await assertEtherBalance(broker, operator, '0')
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                params.offerAsset = ETHER_ADDR
                params.offerAmount = 7
                params.feeAsset = ETHER_ADDR
                params.feeAmount = 3

                await makeOffer(broker, params, { from: coordinator })

                await assertOfferParams(broker, params)
                await assertEtherBalance(broker, user, '999999999999999990')
                await assertEtherBalance(broker, operator, '3')
            })

            contract('when the user has insufficient balance to pay fees', async () => {
                it('throws an error', async () => {
                    await assertEtherBalance(broker, operator, '0')
                    const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                    params.feeAsset = ETHER_ADDR
                    params.feeAmount = 3

                    await assertError(makeOffer, broker, params, { from: user })

                    await assertOfferDoesNotExist(broker, params)
                    await assertEtherBalance(broker, user, initialEtherBalance)
                    await assertEtherBalance(broker, operator, '0')
                })
            })
        })

        contract('when the fee asset is different from the offerAsset', async () => {
            it('updates balances appropriately', async () => {
                await assertTokenBalance(broker, operator, token.address, '0')
                await assertTokenBalance(broker, user, token.address, '100')
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                params.feeAsset = token.address
                params.feeAmount = 21

                await makeOffer(broker, params, { from: coordinator })

                await assertOfferParams(broker, params)
                await assertEtherBalance(broker, user, '1')
                await assertTokenBalance(broker, user, token.address, '79')
                await assertTokenBalance(broker, operator, token.address, '21')
            })

            contract('when the user has insufficient balance to pay fees', async () => {
                it('throws an error', async () => {
                    await assertTokenBalance(broker, operator, token.address, '0')
                    await assertTokenBalance(broker, user, token.address, '100')
                    const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                    params.feeAsset = token.address
                    params.feeAmount = 101

                    await assertError(makeOffer, broker, params, { from: user })

                    await assertOfferDoesNotExist(broker, params)
                    await assertEtherBalance(broker, user, initialEtherBalance)
                })
            })
        })
    })

    contract('when valid values are used', async () => {
        it('does not throw an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params, { from: coordinator })
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')
        })
    })

    contract('when the sender is not the coordinator', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await assertError(makeOffer, broker, params, { from: user })
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, initialEtherBalance)
        })
    })

    contract('when the signature is invalid', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            const signature = await signMakeOffer(params, coordinator)
            await assertError(makeOffer, broker, params, { from: coordinator }, signature)
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, initialEtherBalance)
        })
    })

    contract('when offerAmount is 1', async () => {
        it('correctly reduces the maker\'s balance', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.offerAmount = 1
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '999999999999999999')
        })
    })

    contract('when offerAmount is the same as the maker\s balance', async () => {
        it('reduces the maker\'s balance to zero', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.offerAmount = initialEtherBalance
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '0')
        })
    })

    contract('when the offerAmount is more than the maker\'s balance', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.offerAmount = initialEtherBalance.plus(1)
            await assertError(makeOffer, broker, params)
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, initialEtherBalance)
        })
    })

    contract('when the offerAmount is not more than 0', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.offerAmount = 0
            await assertError(makeOffer, broker, params)
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, initialEtherBalance)
        })
    })


    contract('when the wantAmount is not more than 0', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.wantAmount = 0
            await assertError(makeOffer, broker, params)
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, initialEtherBalance)
        })
    })

    contract('when the offerAsset is the same as wantAsset', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.offerAsset = params.wantAsset
            await assertError(makeOffer, broker, params)
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, initialEtherBalance)
        })
    })

    contract('when the same maker + nonce pair is used twice', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertError(makeOffer, broker, params)
            await assertEtherBalance(broker, user, '1')
        })
    })

    contract('when the offer is created, then cancelled, then the same offer params is sent', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)

            const offerHash = getOfferHash(params)
            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 })
            await broker.cancel.sendTransaction(offerHash, params.offerAmount, '0x0', 0, v, r, s, { from: coordinator })
            await assertEtherBalance(broker, user, '1000000000000000000')

            await assertError(makeOffer, broker, params)
            await assertOfferDoesNotExist(broker, params)
            await assertEtherBalance(broker, user, '1000000000000000000')
        })
    })
})
