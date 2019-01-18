const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)
const { BigNumber } = require('bignumber.js')

const { ETHER_ADDR, REASON, nonceGenerator, getSampleOfferParams, emptyOfferParams, getValidFillParams,
    assertError, assertOfferParams, assertEtherBalance, assertTokenBalance, assertEventEmission,
    fetchOffer, makeOffer, getOfferHash, fillOffer, signFillOffer, withdraw  } = require('../../utils/testUtils')

contract('Test fillOffer', async () => {
    let broker, token, filler, user, accounts, coordinator, operator, sampleOffer, sampleOfferHash
    let initialEtherBalance, initialTokenBalance, totalTokenAmounts

    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    const getValidFillParams = () => {
        // Fill -- take 3 ETH, fee 1 ETH
        const fillParams = {
            filler,
            offerHash: sampleOfferHash,
            amountToTake: '3',
            feeAmount: '1',
            feeAsset: ETHER_ADDR,
            nonce: nextNonce()
        }
        return fillParams
    }

    const getInitialBalanceDistribution = () => {
        return {
            operator: { eth: '0', jr: '0', sw: '0' },
            user: { eth: '999999999999999990', jr: '30', sw: '0' },
            filler: { eth: '0', jr: '50', sw: '100' },
            offer: { availableAmount: '10' }
        }
    }

    const setNestedValue = (s1, s2, key1, key2) => {
        if (s2 === undefined) { return }
        if (s2[key1] === undefined) { return }
        if (s2[key1][key2] === undefined) { return }
        s1[key1][key2] = s2[key1][key2]
    }

    const getBalance = async (address, tokenAddress) => {
        const balance = await broker.balances.call(address, tokenAddress)
        return balance.toString()
    }

    const fetchBalanceDistribution = async () => {
        const state = {
            operator: {},
            user: {},
            filler: {},
            offer: {}
        }
        state.operator.eth = await getBalance(operator, ETHER_ADDR)
        state.operator.jr = await getBalance(operator, token.address)
        state.operator.sw = await getBalance(operator, swToken.address)

        state.user.eth = await getBalance(user, ETHER_ADDR)
        state.user.jr = await getBalance(user, token.address)
        state.user.sw = await getBalance(user, swToken.address)

        state.filler.eth = await getBalance(filler, ETHER_ADDR)
        state.filler.jr = await getBalance(filler, token.address)
        state.filler.sw = await getBalance(filler, swToken.address)

        const offer = await fetchOffer(broker, sampleOfferHash)
        state.offer.availableAmount = offer.availableAmount.toString()

        return state
    }

    const assertBalanceDistribution = async (distributionOverrides) => {
        const expectedDistribution = getInitialBalanceDistribution()
        setNestedValue(expectedDistribution, distributionOverrides, 'operator', 'eth')
        setNestedValue(expectedDistribution, distributionOverrides, 'operator', 'jr')
        setNestedValue(expectedDistribution, distributionOverrides, 'operator', 'sw')

        setNestedValue(expectedDistribution, distributionOverrides, 'user', 'eth')
        setNestedValue(expectedDistribution, distributionOverrides, 'user', 'jr')
        setNestedValue(expectedDistribution, distributionOverrides, 'user', 'sw')

        setNestedValue(expectedDistribution, distributionOverrides, 'filler', 'eth')
        setNestedValue(expectedDistribution, distributionOverrides, 'filler', 'jr')
        setNestedValue(expectedDistribution, distributionOverrides, 'filler', 'sw')

        setNestedValue(expectedDistribution, distributionOverrides, 'offer', 'availableAmount')

        const state = await fetchBalanceDistribution()

        // Check operator balances
        assert.equal(expectedDistribution.operator.eth, state.operator.eth, 'valid operator.eth state')
        assert.equal(expectedDistribution.operator.jr, state.operator.jr, 'valid operator.jr state')
        assert.equal(expectedDistribution.operator.sw, state.operator.sw, 'valid operator.sw state')

        // Check maker balances
        assert.equal(expectedDistribution.user.eth, state.user.eth, 'valid user.eth state')
        assert.equal(expectedDistribution.user.jr, state.user.jr, 'valid user.jr state')
        assert.equal(expectedDistribution.user.sw, state.user.sw, 'valid user.sw state')

        // Check filler balances
        assert.equal(expectedDistribution.filler.eth, state.filler.eth, 'valid filler.eth state')
        assert.equal(expectedDistribution.filler.jr, state.filler.jr, 'valid filler.jr state')
        assert.equal(expectedDistribution.filler.sw, state.filler.sw, 'valid filler.sw state')

        // Check offer availableAmount
        assert.equal(expectedDistribution.offer.availableAmount, state.offer.availableAmount, 'valid offer.availableAmount state')
    }

    const assertInitialBalanceDistribution = assertBalanceDistribution

    const fetchTotalTokenAmounts = async ({ accounts, offerHashes, tokenAddresses } = {}) => {
        if (accounts === undefined) { accounts = [operator, user, filler] }
        if (offerHashes === undefined) { offerHashes = [sampleOfferHash] }
        if (tokenAddresses === undefined) { tokenAddresses = [ETHER_ADDR, token.address] }

        const amounts = {}

        for (const tokenAddress of tokenAddresses) {
            let tokenBalance = new BigNumber(0)
            for (const account of accounts) {
                const balance = await broker.balances.call(account, tokenAddress)
                tokenBalance = tokenBalance.plus(balance)
            }
            amounts[tokenAddress] = tokenBalance
        }

        for (const offerHash of offerHashes) {
            const offer = await fetchOffer(broker, offerHash)
            const { offerAsset, availableAmount } = offer
            if (amounts[offerAsset] === undefined) {
                amounts[offerAsset] = new BigNumber(0)
            }
            amounts[offerAsset] = amounts[offerAsset].plus(availableAmount)
        }

        return amounts
    }

    const storeTotalTokenAmounts = async (params) => {
        totalTokenAmounts = await fetchTotalTokenAmounts(params)
    }

    const assertNoAssetsWereLost = async ({ accounts, offerHashes, tokenAddresses } = {}) => {
        if (tokenAddresses === undefined) { tokens = [ETHER_ADDR, token.address, swToken.address] }
        const currentTotals = await fetchTotalTokenAmounts({ accounts, offerHashes, tokenAddresses })
        for (const tokenAddress in totalTokenAmounts) {
            assert.equal(currentTotals[tokenAddress].toString(), totalTokenAmounts[tokenAddress].toString(), 'Check amounts for ' + tokenAddress)
        }
    }

    beforeEach(async () => {
        broker = await Broker.deployed()
        token = await JRCoin.deployed()
        swToken = await SWCoin.deployed()
        accounts = await web3.eth.getAccounts()

        coordinator = accounts[0]
        operator = accounts[0]
        user = accounts[1]
        filler = accounts[2]
        await broker.depositEther.sendTransaction({ from: user, value: web3.utils.toWei('1', 'ether') })
        initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(initialEtherBalance, '1000000000000000000')

        await swToken.mint.sendTransaction(filler, 100)
        await swToken.approve.sendTransaction(broker.address, 100, { from: filler })
        await broker.depositERC20.sendTransaction(filler, swToken.address, 100, { from: coordinator })

        await token.mint.sendTransaction(filler, 50)
        await token.approve.sendTransaction(broker.address, 50,  { from: filler })
        await broker.depositERC20.sendTransaction(filler, token.address, 50, { from: coordinator })
        initialTokenBalance = await broker.balances.call(filler, token.address)
        assert.equal(initialTokenBalance.toString(), '50')

        await token.mint.sendTransaction(user, 30)
        await token.approve.sendTransaction(broker.address, 30,  { from: user })
        await broker.depositERC20.sendTransaction(user, token.address, 30, { from: coordinator })

        // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
        sampleOffer = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
        sampleOffer.offerAmount = 10
        sampleOffer.wantAsset = token.address
        sampleOffer.wantAmount = 20
        await makeOffer(broker, sampleOffer)
        await assertOfferParams(broker, sampleOffer)
        await assertEtherBalance(broker, user, '999999999999999990')
        sampleOfferHash = getOfferHash(sampleOffer)

        await assertInitialBalanceDistribution()
        await storeTotalTokenAmounts()
    })

    contract('test event emission', async () => {
        contract('when the feeAsset is the same as the offer.offerAsset', async () => {
            it('emits BalanceIncrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, Fill events', async () => {
                // Before Fill
                // Operator -- 0 ETH, 0 JR
                // Maker -- 999999999999999990 ETH, 30 JR
                // Offer -- availableAmount: 10 ETH
                // Filler -- 0 ETH, 50 JR
                const fillParams = getValidFillParams()

                // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                // Fill -- amountToTake: 3 ETH, fee: 1 ETH,
                // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                // amountToTakeAfterFees: 3 ETH - 1 ETH = 2 ETH
                const signature = await signFillOffer(fillParams)
                const { v, r, s } = signature
                const { logs } = await broker.fillOffer(fillParams.filler, fillParams.offerHash, fillParams.amountToTake,
                    fillParams.feeAsset, fillParams.feeAmount, fillParams.nonce, v, r, s)
                const offer = await fetchOffer(broker, fillParams.offerHash)

                // After Fill
                // Operator -- 0 ETH + 1 ETH = 1 ETH, 0 JR
                // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
                // Filler -- 0 ETH + 2 ETH = 2 ETH, 50 JR - 6 JR = 44 JR
                // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: token.address,
                            amount: '6',
                            reason: REASON.ReasonFillerGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: user.toLowerCase(),
                            token: token.address,
                            amount: '6',
                            reason: REASON.ReasonMakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '2',
                            reason: REASON.ReasonFillerReceive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '1',
                            reason: REASON.ReasonFillerFeeReceive
                        }
                    },
                    {
                        eventType: 'Fill',
                        args: {
                            filler: filler.toLowerCase(),
                            offerHash: sampleOfferHash,
                            amountFilled: '6',
                            amountTaken: '3',
                            maker: user.toLowerCase()
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })

        contract('when the feeAsset is the same as the offer.wantAsset', async () => {
            // events for fees are not combined for this case, so there should be 5 events emitted
            it('emits BalanceIncrease, BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, Fill events', async () => {
                // Before Fill
                // Operator -- 0 ETH, 0 JR
                // Maker -- 999999999999999990 ETH, 30 JR
                // Offer -- availableAmount: 10 ETH
                // Filler -- 0 ETH, 50 JR
                const fillParams = getValidFillParams()
                fillParams.feeAmount = '18'
                fillParams.feeAsset = token.address

                // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                // Fill -- amountToTake: 3 ETH
                // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                // feeAmount: 18 JR
                // amountToTakeAfterFees: 3 ETH
                const signature = await signFillOffer(fillParams)
                const { v, r, s } = signature
                const { logs } = await broker.fillOffer(fillParams.filler, fillParams.offerHash, fillParams.amountToTake,
                    fillParams.feeAsset, fillParams.feeAmount, fillParams.nonce, v, r, s)
                const offer = await fetchOffer(broker, fillParams.offerHash)

                // After Fill
                // Operator -- 0 JR + 18 JR = 18 JR
                // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
                // Filler -- 0 ETH + 3 ETH = 3 ETH, 50 JR - 6 JR - 18 JR = 26 JR
                // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: token.address,
                            amount: '6',
                            reason: REASON.ReasonFillerGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: user.toLowerCase(),
                            token: token.address,
                            amount: '6',
                            reason: REASON.ReasonMakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '3',
                            reason: REASON.ReasonFillerReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: token.address,
                            amount: '18',
                            reason: REASON.ReasonFillerFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: token.address,
                            amount: '18',
                            reason: REASON.ReasonFillerFeeReceive
                        }
                    },
                    {
                        eventType: 'Fill',
                        args: {
                            filler: filler.toLowerCase(),
                            offerHash: sampleOfferHash,
                            amountFilled: '6',
                            amountTaken: '3',
                            maker: user.toLowerCase()
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })

        contract('when the feeAsset is different from the offer.offerAsset and offer.wantAsset', async () => {
            it('emits BalanceIncrease, BalanceDecrease, BalanceIncrease, BalanceDecrease, BalanceIncrease, Fill events', async () => {
                // Before Fill
                // Operator -- 0 ETH, 0 JR
                // Maker -- 999999999999999990 ETH, 30 JR
                // Offer -- availableAmount: 10 ETH
                // Filler -- 0 ETH, 50 JR, 100 SW
                const fillParams = getValidFillParams()
                fillParams.feeAmount = '27'
                fillParams.feeAsset = swToken.address

                // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                // Fill -- amountToTake: 3 ETH, fee: 27 SW
                // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                // feeAmount: 27 SW
                // amountToTakeAfterFees: 3 ETH
                const signature = await signFillOffer(fillParams)
                const { v, r, s } = signature
                const { logs } = await broker.fillOffer(fillParams.filler, fillParams.offerHash, fillParams.amountToTake,
                    fillParams.feeAsset, fillParams.feeAmount, fillParams.nonce, v, r, s)
                const offer = await fetchOffer(broker, fillParams.offerHash)

                // After Fill
                // Operator -- 0 SW + 27 SW = 27 SW
                // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
                // Filler -- 0 ETH + 3 ETH = 3 ETH, 50 JR - 6 JR = 44 JR, 100 SW - 27 SW = 73 SW
                // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
                const expectedEvents = [
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: token.address,
                            amount: '6',
                            reason: REASON.ReasonFillerGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: user.toLowerCase(),
                            token: token.address,
                            amount: '6',
                            reason: REASON.ReasonMakerReceive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: ETHER_ADDR,
                            amount: '3',
                            reason: REASON.ReasonFillerReceive
                        }
                    },
                    {
                        eventType: 'BalanceDecrease',
                        args: {
                            user: filler.toLowerCase(),
                            token: swToken.address,
                            amount: '27',
                            reason: REASON.ReasonFillerFeeGive
                        }
                    },
                    {
                        eventType: 'BalanceIncrease',
                        args: {
                            user: operator.toLowerCase(),
                            token: swToken.address,
                            amount: '27',
                            reason: REASON.ReasonFillerFeeReceive
                        }
                    },
                    {
                        eventType: 'Fill',
                        args: {
                            filler: filler.toLowerCase(),
                            offerHash: sampleOfferHash,
                            amountFilled: '6',
                            amountTaken: '3',
                            maker: user.toLowerCase()
                        }
                    }
                ]
                assertEventEmission(logs, expectedEvents)
            })
        })
    })

    contract('test fees', async () => {
        contract('when the fee asset is the same as the offer asset', async () => {
            contract('when the fee amount exceeds the take amount', async () => {
                it('throws an error', async () => {
                    // Before Fill
                    // Operator -- 0 ETH, 0 JR
                    // Maker -- 999999999999999990 ETH, 30 JR
                    // Offer -- availableAmount: 10 ETH
                    // Filler -- 0 ETH, 50 JR, 100 SW
                    const fillParams = getValidFillParams()
                    fillParams.feeAmount = '4'
                    fillParams.feeAsset = ETHER_ADDR

                    // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                    // Fill -- amountToTake: 3 ETH, fee: 4 ETH
                    // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                    // feeAmount: 4 ETH
                    // amountToTakeAfterFees: -1 ETH
                    await assertError(fillOffer, broker, fillParams)
                    await assertInitialBalanceDistribution()
                    await assertNoAssetsWereLost()
                })
            })
        })

        contract('when the fee asset is the same as the want asset', async () => {
            it('updates balances appropriately', async () => {
                // Before Fill
                // Operator -- 0 ETH, 0 JR
                // Maker -- 999999999999999990 ETH, 30 JR
                // Offer -- availableAmount: 10 ETH
                // Filler -- 0 ETH, 50 JR
                const fillParams = getValidFillParams()
                fillParams.feeAmount = '18'
                fillParams.feeAsset = token.address

                // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                // Fill -- amountToTake: 3 ETH
                // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                // feeAmount: 18 JR
                // amountToTakeAfterFees: 3 ETH
                await fillOffer(broker, fillParams)
                await assertNoAssetsWereLost()

                // After Fill
                // Operator -- 0 JR + 18 JR = 18 JR
                // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
                // Filler -- 0 ETH + 3 ETH = 3 ETH, 50 JR - 6 JR - 18 JR = 26 JR
                // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
                await assertBalanceDistribution({
                    operator: { eth: '0', jr: '18' },
                    user: { eth: '999999999999999990', jr: '36' },
                    filler: { eth: '3', jr: '26' },
                    offer: { availableAmount: '7' }
                })

                // Check that the offer still exists
                sampleOffer.availableAmount = '7'
                await assertOfferParams(broker, sampleOffer, sampleOfferHash)
            })

            contract('when the user has insufficient assets to pay fees', async () => {
                it('throws an error', async () => {
                    // Before Fill
                    // Operator -- 0 ETH, 0 JR
                    // Maker -- 999999999999999990 ETH, 30 JR
                    // Offer -- availableAmount: 10 ETH
                    // Filler -- 0 ETH, 50 JR, 100 SW
                    const fillParams = getValidFillParams()
                    fillParams.feeAmount = '45'
                    fillParams.feeAsset = token.address

                    // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                    // Fill -- amountToTake: 3 ETH, fee: 45 JR
                    // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                    // feeAmount: 45 JR
                    // amountToTakeAfterFees: 3 ETH
                    await assertError(fillOffer, broker, fillParams)
                    await assertInitialBalanceDistribution()
                    await assertNoAssetsWereLost()
                })
            })
        })

        contract('when the fee asset is different from the offer asset and want asset', async () => {
            it('updates balances appropriately', async () => {
                // Before Fill
                // Operator -- 0 ETH, 0 JR
                // Maker -- 999999999999999990 ETH, 30 JR
                // Offer -- availableAmount: 10 ETH
                // Filler -- 0 ETH, 50 JR, 100 SW
                const fillParams = getValidFillParams()
                fillParams.feeAmount = '27'
                fillParams.feeAsset = swToken.address

                // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                // Fill -- amountToTake: 3 ETH, fee: 27 SW
                // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                // feeAmount: 27 SW
                // amountToTakeAfterFees: 3 ETH
                await fillOffer(broker, fillParams)
                await assertNoAssetsWereLost()

                // After Fill
                // Operator -- 0 SW + 27 SW = 27 SW
                // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
                // Filler -- 0 ETH + 3 ETH = 3 ETH, 50 JR - 6 JR = 44 JR, 100 SW - 27 SW = 73 SW
                // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
                await assertBalanceDistribution({
                    operator: { eth: '0', jr: '0', sw: '27' },
                    user: { eth: '999999999999999990', jr: '36' },
                    filler: { eth: '3', jr: '44', sw: '73' },
                    offer: { availableAmount: '7' }
                })

                // Check that the offer still exists
                sampleOffer.availableAmount = '7'
                await assertOfferParams(broker, sampleOffer, sampleOfferHash)
            })

            contract('when the user has insufficient balance to pay fees', async () => {
                it('throws an error', async () => {
                    // Before Fill
                    // Operator -- 0 ETH, 0 JR
                    // Maker -- 999999999999999990 ETH, 30 JR
                    // Offer -- availableAmount: 10 ETH
                    // Filler -- 0 ETH, 50 JR, 100 SW
                    const fillParams = getValidFillParams()
                    fillParams.feeAmount = '101'
                    fillParams.feeAsset = swToken.address

                    // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
                    // Fill -- amountToTake: 3 ETH
                    // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
                    // feeAmount: 101 SW
                    // amountToTakeAfterFees: 3 ETH
                    await assertError(fillOffer, broker, fillParams)
                    await assertInitialBalanceDistribution()
                    await assertNoAssetsWereLost()
                })
            })
        })
    })

    contract('when valid params are used', async () => {
        it('fills the offer', async () => {
            // Before Fill
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR
            // Offer -- availableAmount: 10 ETH
            // Filler -- 0 ETH, 50 JR
            const fillParams = getValidFillParams()

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 3 ETH, fee: 1 ETH,
            // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
            // amountToTakeAfterFees: 3 ETH - 1 ETH = 2 ETH
            await fillOffer(broker, fillParams)
            await assertNoAssetsWereLost()

            // After Fill
            // Operator -- 0 ETH + 1 ETH = 1 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
            // Filler -- 0 ETH + 2 ETH = 2 ETH, 50 JR - 6 JR = 44 JR
            // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
            await assertBalanceDistribution({
                operator: { eth: '1', jr: '0' },
                user: { eth: '999999999999999990', jr: '36' },
                filler: { eth: '2', jr: '44' },
                offer: { availableAmount: '7' }
            })

            // Check that the offer still exists
            sampleOffer.availableAmount = '7'
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
        })
    })

    contract('when the feeAsset is the same as the offer.wantAsset', async () => {
        it('updates balances appropriately', async () => {
            // Before Fill
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR
            // Offer -- availableAmount: 10 ETH
            // Filler -- 0 ETH, 50 JR
            const fillParams = getValidFillParams()
            fillParams.feeAmount = '21'
            fillParams.feeAsset = token.address

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 3 ETH, fee: 21 JR
            // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
            // amountToTakeAfterFees: 3 ETH - 0 ETH = 3 ETH
            await fillOffer(broker, fillParams)
            await assertNoAssetsWereLost()

            // After Fill
            // Operator -- 0 SW + 21 JR = 21 JR
            // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
            // Filler -- 0 ETH + 3 ETH = 3 ETH, 50 JR - 6 JR - 21 JR = 23 JR
            // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
            await assertBalanceDistribution({
                operator: { eth: '0', jr: '21', sw: '0' },
                user: { eth: '999999999999999990', jr: '36' },
                filler: { eth: '3', jr: '23', sw: '100' },
                offer: { availableAmount: '7' }
            })

            // Check that the offer still exists
            sampleOffer.availableAmount = '7'
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
        })
    })

    contract('when the feeAsset is not the same as the offer.offerAsset or offer.wantAsset', async () => {
        it('updates balances appropriately', async () => {
            // Before Fill
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR
            // Offer -- availableAmount: 10 ETH
            // Filler -- 0 ETH, 50 JR
            const fillParams = getValidFillParams()
            fillParams.feeAmount = '21'
            fillParams.feeAsset = swToken.address

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 3 ETH, fee: 21 SW
            // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
            // amountToTakeAfterFees: 3 ETH - 0 ETH = 3 ETH
            await fillOffer(broker, fillParams)
            await assertNoAssetsWereLost()

            // After Fill
            // Operator -- 0 SW + 21 SW = 21 SW
            // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
            // Filler -- 0 ETH + 3 ETH = 3 ETH, 50 JR - 6 JR = 44 JR, 100 SW - 21 SW = 79 SW
            // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
            await assertBalanceDistribution({
                operator: { eth: '0', jr: '0', sw: '21' },
                user: { eth: '999999999999999990', jr: '36' },
                filler: { eth: '3', jr: '44', sw: '79' },
                offer: { availableAmount: '7' }
            })

            // Check that the offer still exists
            sampleOffer.availableAmount = '7'
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
        })
    })

    contract('when the offer is fully filled', async () => {
        it('clears the offer', async () => {
            // Before Fill
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR
            // Offer -- availableAmount: 10 ETH
            // Filler -- 0 ETH, 50 JR
            const fillParams = getValidFillParams()

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 10 ETH, fee: 1 ETH
            // fillAmount:  (10 ETH * 20 JR) / (10 ETH) = 20 JR
            // amountToTakeAfterFees: 10 ETH - 1 ETH = 9 ETH
            fillParams.amountToTake = '10'

            await fillOffer(broker, fillParams)
            await assertNoAssetsWereLost()

            // After Fill
            // Operator -- 0 ETH + 1 ETH = 1 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR + 20 JR = 50 JR
            // Filler -- 0 ETH + 9 ETH = 9 ETH, 50 JR - 20 JR = 30 JR
            // Offer -- availableAmount: 10 ETH - 10 ETH = 0 ETH
            await assertBalanceDistribution({
                operator: { eth: '1', jr: '0' },
                user: { eth: '999999999999999990', jr: '50' },
                filler: { eth: '9', jr: '30' },
                offer: { availableAmount: '0' }
            })
            await assertOfferParams(broker, emptyOfferParams, sampleOfferHash)
        })
    })

    contract('when the filler does not have sufficient balance', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            await withdraw(broker, {
                withdrawer: filler,
                token: token.address,
                amount: '45',
                feeAsset: ETHER_ADDR,
                feeAmount: '0',
                nonce: nextNonce()
            })
            await storeTotalTokenAmounts()
            await assertTokenBalance(broker, filler, token.address, '5')
            await assertError(fillOffer, broker, fillParams)
            await assertInitialBalanceDistribution({ filler: { jr: '5' } })
            await assertNoAssetsWereLost()
        })
    })

    contract('when the offer does not have sufficient available amount for the take amount', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            fillParams.amountToTake = 11
            await assertError(fillOffer, broker, fillParams)
            await assertInitialBalanceDistribution()
            await assertNoAssetsWereLost()
        })
    })

    contract('when the same params are sent twice', async () => {
        it('fills the offer the first time, throws an error the second time', async () => {
            const fillParams = getValidFillParams()
            await fillOffer(broker, fillParams)
            const offer = await fetchOffer(broker, sampleOfferHash)
            assert.equal(offer.availableAmount.toString(), '7', 'available amount is reduced')

            await assertError(fillOffer, broker, fillParams)
            await assertNoAssetsWereLost()
        })
    })

    contract('when the sender is not the coordinator', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            await assertError(fillOffer, broker, fillParams, { from: user })
            await assertInitialBalanceDistribution()
            await assertNoAssetsWereLost()
        })
    })

    contract('when the signature is invalid', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            const signature = await signFillOffer(fillParams, coordinator)
            await assertError(fillOffer, broker, fillParams, { from: coordinator }, signature)
            await assertInitialBalanceDistribution()
            await assertNoAssetsWereLost()
        })
    })

    contract('when the offer does not exist', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            const offerParams = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
            fillParams.offerHash = getOfferHash(offerParams)
            await assertError(fillOffer, broker, fillParams)
            await assertInitialBalanceDistribution()
            await assertNoAssetsWereLost()
        })
    })

    contract('when the filler is the offer maker', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            fillParams.filler = user
            await assertError(fillOffer, broker, fillParams)
            await assertInitialBalanceDistribution()
            await assertNoAssetsWereLost()
        })
    })

    contract('when the amount to take is zero', async () => {
        it('throws an error', async () => {
            const fillParams = getValidFillParams()
            fillParams.amountToTake = '0'
            await assertError(fillOffer, broker, fillParams)
            await assertInitialBalanceDistribution()
            await assertNoAssetsWereLost()
        })
    })

    contract('when the fill amount is not a whole number', async () => {
        it('truncates the fill amount', async () => {
            // Before Make Offer
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR
            // Filler -- 0 ETH, 50 JR
            const offerParams = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
            offerParams.offerAmount = 3
            offerParams.wantAsset = token.address
            offerParams.wantAmount = 10
            await makeOffer(broker, offerParams)
            const offerHash = getOfferHash(offerParams)
            await assertNoAssetsWereLost({ offerHashes: [sampleOfferHash, offerHash] })


            // After Make Offer
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999987 ETH, 30 JR
            // Offer -- availableAmount: 3 ETH
            // Filler -- 0 ETH, 50 JR
            await assertOfferParams(broker, offerParams)
            await assertBalanceDistribution({
                operator: { eth: '0', jr: '0' },
                user: { eth: '999999999999999987', jr: '30' },
                filler: { eth: '0', jr: '50' }
            })
            const o1 = await fetchOffer(broker, offerHash)
            assert.equal(o1.availableAmount.toString(), '3')

            const fillParams = getValidFillParams()
            fillParams.offerHash = offerHash
            fillParams.amountToTake = 2
            // Offer -- offerAmount: 3 ETH, wantAmount: 10 JR
            // Fill -- amountToTake: 2 ETH, fee: 1 ETH
            // fillAmount:  (2 ETH * 10 JR) / (3 ETH) = 6.6666... JR
            // amountToTakeAfterFees: 2 ETH - 1 ETH = 1 ETH
            await fillOffer(broker, fillParams)
            await assertNoAssetsWereLost({ offerHashes: [sampleOfferHash, offerHash] })

            const balances = await fetchBalanceDistribution()

            // After Fill
            // Operator -- 0 ETH + 1 ETH = 1 ETH, 0 JR
            // Maker -- 999999999999999987 ETH, 30 JR + 6 JR = 36 JR
            // Filler -- 0 ETH + 1 ETH = 1 ETH, 50 JR - 6 JR = 44 JR
            // Offer -- availableAmount: 3 ETH - 2 ETH = 1 ETH
            await assertBalanceDistribution({
                operator: { eth: '1', jr: '0' },
                user: { eth: '999999999999999987', jr: '36' },
                filler: { eth: '1', jr: '44' }
            })
            const o2 = await fetchOffer(broker, offerHash)
            assert.equal(o2.availableAmount.toString(), '1')
        })
    })

    contract('when the offer is filled multiple times', async () => {
        it('updates balances and availableAmount appropriately', async () => {
            // Before Fill
            // Operator -- 0 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR
            // Offer -- availableAmount: 10 ETH
            // Filler -- 0 ETH, 50 JR
            const fillParams1 = getValidFillParams()

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 3 ETH, fee: 1 ETH
            // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
            // amountToTakeAfterFees: 3 ETH - 1 ETH = 2 ETH
            await fillOffer(broker, fillParams1)
            await assertNoAssetsWereLost()

            // After First Fill
            // Operator -- 0 ETH + 1 ETH = 1 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 30 JR + 6 JR = 36 JR
            // Filler -- 0 ETH + 2 ETH = 2 ETH, 50 JR - 6 JR = 44 JR
            // Offer -- availableAmount: 10 ETH - 3 ETH = 7 ETH
            await assertBalanceDistribution({
                operator: { eth: '1', jr: '0' },
                user: { eth: '999999999999999990', jr: '36' },
                filler: { eth: '2', jr: '44' },
                offer: { availableAmount: '7' }
            })

            // Check that the offer still exists
            sampleOffer.availableAmount = '7'
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 3 ETH, fee: 1 ETH
            // fillAmount:  (3 ETH * 20 JR) / (10 ETH) = 6 JR
            // amountToTakeAfterFees: 3 ETH - 1 ETH = 2 ETH
            const fillParams2 = getValidFillParams()
            await fillOffer(broker, fillParams2)
            await assertNoAssetsWereLost()

            // After Second Fill
            // Operator -- 1 ETH + 1 ETH = 2 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 36 JR + 6 JR = 42 JR
            // Filler -- 2 ETH + 2 ETH = 4 ETH, 44 JR - 6 JR = 38 JR
            // Offer -- availableAmount: 7 ETH - 3 ETH = 4 ETH
            await assertBalanceDistribution({
                operator: { eth: '2', jr: '0' },
                user: { eth: '999999999999999990', jr: '42' },
                filler: { eth: '4', jr: '38' },
                offer: { availableAmount: '4' }
            })

            // Check that the offer still exists
            sampleOffer.availableAmount = '4'
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)

            // Offer -- offerAmount: 10 ETH, wantAmount: 20 JR
            // Fill -- amountToTake: 4 ETH, fee: 2 ETH
            // fillAmount:  (4 ETH * 20 JR) / (10 ETH) = 8 JR
            // amountToTakeAfterFees: 4 ETH - 2 ETH = 2 ETH
            const fillParams3 = getValidFillParams()
            fillParams3.amountToTake = 4
            fillParams3.feeAmount = 2
            await fillOffer(broker, fillParams3)
            await assertNoAssetsWereLost()

            // After Third Fill
            // Operator -- 2 ETH + 2 ETH = 4 ETH, 0 JR
            // Maker -- 999999999999999990 ETH, 42 JR + 8 JR = 50 JR
            // Filler -- 4 ETH + 2 ETH = 6 ETH, 38 JR - 8 JR = 30 JR
            // Offer -- availableAmount: 4 ETH - 4 ETH = 0 ETH
            await assertBalanceDistribution({
                operator: { eth: '4', jr: '0' },
                user: { eth: '999999999999999990', jr: '50' },
                filler: { eth: '6', jr: '30' },
                offer: { availableAmount: '0' }
            })

            // Check that the offer is removed from storage
            await assertOfferParams(broker, emptyOfferParams, sampleOfferHash)
        })
    })
})
