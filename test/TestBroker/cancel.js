const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ZERO_ADDR, ETHER_ADDR, REASON, nonceGenerator, emptyOfferParams, getValidOfferParams,
    assertError, assertOfferParams, assertEtherBalance, assertTokenBalance, assertEventEmission,
    makeOffer, fillOffer, signCancel, getOfferHash, fetchOffer } = require('../../utils/brokerUtils')

contract('Test cancel', async () => {
    let broker, token, user, accounts, coordinator, initialEtherBalance

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

        await token.mint.sendTransaction(user, 50)
        await token.approve.sendTransaction(broker.address, 50,  { from: user })
        await broker.depositERC20.sendTransaction(user, token.address, 50, { from: coordinator })
        assertTokenBalance(broker, user, token.address, '50')
    })

    contract('test event emission', async () => {
        contract('when there are no fees', async () => {
            it('emits BalanceIncrease and Cancel events', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                await makeOffer(broker, params)
                const offerHash = getOfferHash(params)
                const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 })
                const { logs } = await broker.cancel(offerHash, params.offerAmount, ETHER_ADDR, 0, v, r, s, { from: coordinator })
                assertEventEmission(logs, [{
                    eventType: 'BalanceIncrease',
                    args: {
                        user: user.toLowerCase(),
                        token: ETHER_ADDR,
                        amount: '999999999999999999',
                        reason: REASON.ReasonCancel
                    }
                }, {
                    eventType: 'Cancel',
                    args: {
                        maker: user.toLowerCase(),
                        offerHash
                    }
                }])
            })
        })

        contract('when the fee asset is the same as the offer asset', async () => {
            it('emits BalanceIncrease, BalanceIncrease and Cancel events', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                await makeOffer(broker, params)
                const offerHash = getOfferHash(params)
                const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 2 })
                const { logs } = await broker.cancel(offerHash, params.offerAmount, ETHER_ADDR, 2, v, r, s, { from: coordinator })
                const expectedEvents = [
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: user.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '999999999999999997',
                            reason: REASON.ReasonCancel
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '2',
                            reason: REASON.ReasonCancelFeeReceive
                        }
                    },
                    {
                        eventType: 'Cancel',
                        args: {
                            maker: user.toLowerCase(),
                            offerHash
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })

        contract('when the fee asset different from the offer asset', async () => {
            it('emits BalanceIncrease, BalanceDecrease, BalanceIncrease and Cancel events', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                await makeOffer(broker, params)
                const offerHash = getOfferHash(params)
                const { v, r, s } = await signCancel({ offerParams: params, feeAsset: token.address, feeAmount: 7 })
                const { logs } = await broker.cancel(offerHash, params.offerAmount, token.address, 7, v, r, s, { from: coordinator })
                const expectedEvents = [
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: user.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '999999999999999999',
                            reason: REASON.ReasonCancel
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: user.toLowerCase(),
                            token: token.address,
                            amount: '7',
                            reason: REASON.ReasonCancelFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: token.address,
                            amount: '7',
                            reason: REASON.ReasonCancelFeeReceive
                        }
                    },
                    {
                        eventType: 'Cancel',
                        args: {
                            maker: user.toLowerCase(),
                            offerHash
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })
    })

    contract('test fees', async () => {
        contract('when the fee asset is the same as the offer asset', async () => {
            it('updates balances appropriately', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                await makeOffer(broker, params)

                const offerHash = getOfferHash(params)
                const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 2 })
                await broker.cancel.sendTransaction(offerHash, params.offerAmount, ETHER_ADDR, 2, v, r, s, { from: coordinator })

                await assertEtherBalance(broker, user, '999999999999999998')
                await assertEtherBalance(broker, operator, '2')
            })

            contract('when the fee amount exceeds the availableAmount', async () => {
                it('throws an error', async () => {
                    const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                    params.offerAmount = '50'
                    params.offerAsset = ETHER_ADDR
                    params.wantAmount = '100'
                    params.wantAsset = token.address
                    await makeOffer(broker, params)
                    await assertEtherBalance(broker, user, '999999999999999950')
                    await assertTokenBalance(broker, user, token.address, '50')

                    const filler = accounts[2]
                    await token.mint.sendTransaction(filler, 200)
                    await token.approve.sendTransaction(broker.address, 200,  { from: filler })
                    await broker.depositERC20.sendTransaction(filler, token.address, 200, { from: coordinator })

                    await assertTokenBalance(broker, filler, token.address, '200')

                    const offerHash = getOfferHash(params)
                    const fillParams = { filler, offerHash, amountToTake: '40', feeAmount: '0', feeAsset: ETHER_ADDR, nonce: nextNonce() }
                    await fillOffer(broker, fillParams)

                    await assertTokenBalance(broker, filler, token.address, '120')
                    params.availableAmount = '10'
                    await assertOfferParams(broker, params)

                    const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 11 })
                    await assertError(broker.cancel.sendTransaction, offerHash, '10', ETHER_ADDR, 11, v, r, s, { from: coordinator })
                    params.availableAmount = '10'
                    await assertOfferParams(broker, params)
                    await assertEtherBalance(broker, user, '999999999999999950')
                })
            })
        })

        contract('when the fee asset is different from the offer asset', async () => {
            it('updates balances appropriately', async () => {
                const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                await makeOffer(broker, params)
                await assertTokenBalance(broker, user, token.address, '50')

                const offerHash = getOfferHash(params)
                const { v, r, s } = await signCancel({ offerParams: params, feeAsset: token.address, feeAmount: 7 })
                await broker.cancel.sendTransaction(offerHash, params.offerAmount, token.address, 7, v, r, s, { from: coordinator })

                await assertEtherBalance(broker, user, '1000000000000000000')
                await assertEtherBalance(broker, operator, '0')
                await assertTokenBalance(broker, user, token.address, '43')
                await assertTokenBalance(broker, operator, token.address, '7')
            })

            contract('when the user has insufficient balance to pay fees', async () => {
                it('throws an error', async () => {
                    const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
                    await makeOffer(broker, params)
                    await assertTokenBalance(broker, user, token.address, '50')

                    const offerHash = getOfferHash(params)
                    const { v, r, s } = await signCancel({ offerParams: params, feeAsset: token.address, feeAmount: 51 })

                    await assertError(broker.cancel.sendTransaction, offerHash, params.offerAmount, token.address, 51, v, r, s, { from: coordinator })
                    await assertOfferParams(broker, params)
                    await assertEtherBalance(broker, user, '1')
                    await assertEtherBalance(broker, operator, '0')
                    await assertTokenBalance(broker, operator, token.address, '0')
                })
            })
        })
    })

    contract('when a valid offer hash is used', async () => {
        it('removes the offer from storage', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)

            const offerHash = getOfferHash(params)
            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 })
            await broker.cancel.sendTransaction(offerHash, params.offerAmount, '0x0', 0, v, r, s, { from: coordinator })

            await assertOfferParams(broker, emptyOfferParams, offerHash)
            await assertEtherBalance(broker, user, '1000000000000000000')
        })
    })

    contract('when the offer is partially filled', async () => {
        it('refunds the available amount and not the offer amount', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            params.offerAmount = 10
            params.wantAsset = token.address
            params.wantAmount = 20
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '999999999999999990')

            const filler = accounts[2]

            await token.mint.sendTransaction(filler, 50)
            await token.approve.sendTransaction(broker.address, 50,  { from: filler })
            await broker.depositERC20.sendTransaction(filler, token.address, 50, { from: coordinator })
            await assertTokenBalance(broker, filler, token.address, '50')
            await assertTokenBalance(broker, user, token.address, '50')

            const offerHash = getOfferHash(params)
            const fillParams = {
                filler,
                offerHash,
                amountToTake: '3',
                feeAmount: '1',
                feeAsset: ETHER_ADDR,
                nonce: nextNonce()
            }
            await fillOffer(broker, fillParams)

            await assertEtherBalance(broker, user, '999999999999999990')
            await assertTokenBalance(broker, user, token.address, '56')

            await assertEtherBalance(broker, filler, '2')
            await assertTokenBalance(broker, filler, token.address, '44')

            await assertEtherBalance(broker, operator, '1')
            await assertTokenBalance(broker, coordinator, token.address, '0')

            const o1 = await fetchOffer(broker, offerHash)
            assert.equal(o1.availableAmount.toString(), '7')

            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 })
            await broker.cancel.sendTransaction(offerHash, '7', '0x0', 0, v, r, s, { from: coordinator })

            await assertEtherBalance(broker, user, '999999999999999997')
            await assertTokenBalance(broker, user, token.address, '56')

            await assertEtherBalance(broker, filler, '2')
            await assertTokenBalance(broker, filler, token.address, '44')

            await assertEtherBalance(broker, operator, '1')
            await assertTokenBalance(broker, coordinator, token.address, '0')

            const o2 = await fetchOffer(broker, offerHash)
            assert.equal(o2.availableAmount.toString(), '0')
        })
    })

    contract('when the expectedAvailableAmount is incorrect', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')

            const offerHash = getOfferHash(params)
            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 })
            await assertError(broker.cancel.sendTransaction, offerHash, '3', '0x0', 0, v, r, s, { from: coordinator })
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')
        })
    })

    contract('when the signature is invalid', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')

            const offerHash = getOfferHash(params)
            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 }, coordinator)
            await assertError(broker.cancel.sendTransaction, offerHash, params.offerAmount, '0x0', 0, v, r, s, { from: coordinator })
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')
        })
    })

    contract('when the sender is not the coordinator', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')

            const offerHash = getOfferHash(params)
            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 })
            await assertError(broker.cancel.sendTransaction, offerHash, params.offerAmount, '0x0', 0, v, r, s, { from: user })
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')
        })
    })

    contract('when no offer matchers the offer hash', async () => {
        it('throws an error', async () => {
            const params = await getValidOfferParams(nextNonce, user, initialEtherBalance)
            const offerHash = getOfferHash(params)
            const { v, r, s } = await signCancel({ offerParams: params, feeAsset: ETHER_ADDR, feeAmount: 0 }, coordinator)
            await assertError(broker.cancel.sendTransaction, offerHash, '0', '0x0', 0, v, r, s)
        })
    })
})
