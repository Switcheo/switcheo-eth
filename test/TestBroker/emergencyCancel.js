const Broker = artifacts.require('Broker')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ZERO_ADDR, ETHER_ADDR, REASON, nonceGenerator, emptyOfferParams, getSampleOfferParams,
    assertError, assertOfferParams, assertEtherBalance, assertEventEmission, makeOffer,
    getOfferHash } = require('../../utils/testUtils')

contract('Test emergencyCancel', async () => {
    let broker, user, accounts, coordinator, initialEtherBalance

    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    beforeEach(async () => {
        broker = await Broker.deployed()
        accounts = await web3.eth.getAccounts()
        coordinator = accounts[0]
        user = accounts[1]
        await broker.depositEther.sendTransaction({ from: user, value: web3.utils.toWei('1', 'ether') })
        initialEtherBalance = await broker.balances.call(user, ETHER_ADDR)
        assert.equal(initialEtherBalance, '1000000000000000000')
    })

    contract('test event emission', async () => {
        it('emits BalanceIncrease and Cancel events', async () => {
            const params = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')

            await broker.setState.sendTransaction(1)

            const offerHash = getOfferHash(params)
            const { receipt: { rawLogs: logs } } = await broker.emergencyCancel(offerHash, params.offerAmount, { from: coordinator })
            assertEventEmission(logs, [{
                eventType: 'BalanceIncrease',
                args: {
                    user: user,
                    token: ETHER_ADDR,
                    amount: '999999999999999999',
                    reason: REASON.ReasonCancel
                }
            }, {
                eventType: 'Cancel',
                args: {
                    maker: user,
                    offerHash
                }
            }])
        })
    })

    contract('when trading is frozen', async () => {
        it('cancels the offer', async () => {
            const params = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')

            await broker.setState.sendTransaction(1)

            const offerHash = getOfferHash(params)
            await broker.emergencyCancel.sendTransaction(offerHash, params.offerAmount, { from: coordinator })

            await assertOfferParams(broker, emptyOfferParams, offerHash)
            await assertEtherBalance(broker, user, '1000000000000000000')
        })
    })

    contract('when trading is not frozen', async () => {
        it('throws an error', async () => {
            const params = await getSampleOfferParams(nextNonce, user, initialEtherBalance)
            await makeOffer(broker, params)
            await assertOfferParams(broker, params)
            await assertEtherBalance(broker, user, '1')

            const offerHash = getOfferHash(params)
            await assertError(broker.emergencyCancel.sendTransaction, offerHash, params.offerAmount)
        })
    })
})
