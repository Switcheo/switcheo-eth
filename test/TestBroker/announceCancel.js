const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR, assertError, makeOffer, getOfferHash, assertOfferParams, assertEventEmission,
    signCancel, getSampleOfferParams, nonceGenerator } = require('../../utils/testUtils')
const announceDelay = 604800

contract('Test announceCancel', async () => {
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

        sampleOffer = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
        sampleOffer.offerAmount = 10
        sampleOffer.wantAsset = token.address
        sampleOffer.wantAmount = 20

        await makeOffer(broker, sampleOffer)
        await assertOfferParams(broker, sampleOffer)

        sampleOfferHash = getOfferHash(sampleOffer)
    })

    contract('test event emission', async () => {
        it('emits CancelAnnounce event', async () => {
            const { logs } = await broker.announceCancel(sampleOfferHash, { from: user })
            assertEventEmission(logs, [{
                eventType: 'CancelAnnounce',
                args: {
                    user: user.toLowerCase(),
                    offerHash: sampleOfferHash
                }
            }])
        })
    })

    contract('when valid params are used', async () => {
        it('stores the announcement', async () => {
            await broker.announceCancel.sendTransaction(sampleOfferHash, { from: user })
            const beforeAnnouncementTime = new Date().getTime() / 1000
            const canCancelAt = await broker.announcedCancellations.call(sampleOfferHash)
            assert.notEqual(canCancelAt.toNumber(), 0)
        })
    })

    contract('when the sender is not the maker', async () => {
        it('throws an error', async () => {
            await assertError(broker.announceCancel.sendTransaction, sampleOfferHash, { from: coordinator })
            const canCancelAt = await broker.announcedCancellations.call(sampleOfferHash)
            assert.equal(canCancelAt.toString(), '0')
        })
    })

    contract('when the offer no longer exists', async () => {
        it('throws an error', async () => {
            const { v, r, s } = await signCancel({ offerParams: sampleOffer, feeAsset: ETHER_ADDR, feeAmount: 0 })
            await broker.cancel.sendTransaction(sampleOfferHash, sampleOffer.offerAmount, '0x0', 0, v, r, s, { from: coordinator })
            await assertError(broker.announceCancel.sendTransaction, sampleOfferHash, { from: coordinator })
            const canCancelAt = await broker.announcedCancellations.call(sampleOfferHash)
            assert.equal(canCancelAt.toString(), '0')
        })
    })
})
