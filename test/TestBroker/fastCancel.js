const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR, REASON, assertError, makeOffer, getOfferHash,
    assertOfferParams, assertEventEmission, getValidOfferParams, emptyOfferParams,
    nonceGenerator, assertEtherBalance } = require('../../utils/testUtils')

contract('Test fastCancel', async () => {
    let broker, coordinator, user, accounts, sampleOffer, sampleOfferHash, initialEtherBalance
    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    beforeEach(async () => {
        broker = await Broker.deployed()
        token = await JRCoin.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        user = accounts[1]

        await broker.depositEther.sendTransaction({ from: user, value: web3.utils.toWei('1', 'ether') })
        initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(initialEtherBalance, '1000000000000000000')

        sampleOffer = await getValidOfferParams(nextNonce, user, initialEtherBalance)
        sampleOffer.offerAmount = 10
        sampleOffer.wantAsset = token.address
        sampleOffer.wantAmount = 20

        await makeOffer(broker, sampleOffer)
        await assertOfferParams(broker, sampleOffer)
        await assertEtherBalance(broker, user, '999999999999999990')

        sampleOfferHash = getOfferHash(sampleOffer)
    })

    contract('test event emission', async () => {
        it('emits BalanceIncrease and Cancel events', async () => {
            await broker.announceCancel.sendTransaction(sampleOfferHash, { from: user })
            const { logs } = await broker.fastCancel(sampleOfferHash, sampleOffer.offerAmount)
            assertEventEmission(logs, [{
                eventType: 'BalanceIncrease',
                args: {
                    user: user.toLowerCase(),
                    token: ETHER_ADDR,
                    amount: '10',
                    reason: REASON.ReasonCancel
                }
            }, {
                eventType: 'Cancel',
                args: {
                    maker: user.toLowerCase(),
                    offerHash: sampleOfferHash
                }
            }])
        })
    })

    contract('when valid params are used', async () => {
        it('cancels the offer', async () => {
            await broker.announceCancel.sendTransaction(sampleOfferHash, { from: user })
            const canCancelAt1 = await broker.announcedCancellations.call(sampleOfferHash)
            assert.notEqual(canCancelAt1.toNumber(), 0)
            await broker.fastCancel.sendTransaction(sampleOfferHash, sampleOffer.offerAmount)
            await assertOfferParams(broker, emptyOfferParams, sampleOfferHash)

            const canCancelAt2 = await broker.announcedCancellations.call(sampleOfferHash)
            assert.equal(canCancelAt2.toNumber(), 0, 'Cancellation announcement is removed')
            await assertEtherBalance(broker, user, '1000000000000000000', 'Maker is refunded')
        })
    })

    contract('when the cancellation has not been announced', async () => {
        it('throws an error', async () => {
            await assertError(broker.fastCancel.sendTransaction, sampleOfferHash, sampleOffer.offerAmount)
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
            await assertEtherBalance(broker, user, '999999999999999990')
        })
    })

    contract('when the sender is not the coordinator', async () => {
        it('throws an error', async () => {
            await broker.announceCancel.sendTransaction(sampleOfferHash, { from: user })
            await assertError(broker.fastCancel.sendTransaction, sampleOfferHash, sampleOffer.offerAmount, { from: user })
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
            await assertEtherBalance(broker, user, '999999999999999990')
        })
    })
})
