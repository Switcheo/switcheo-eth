const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR, REASON, assertError, makeOffer, getOfferHash,
    assertOfferParams, assertEventEmission, getValidOfferParams, emptyOfferParams,
    nonceGenerator, assertEtherBalance } = require('../../utils/brokerUtils')
const announceDelay = 604800

increaseTime = async (time) => (
    new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_increaseTime", params: [time], id: new Date().getTime() },
            (err, _result) => {
                if (err) return reject(err)

                web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_mine", params: [], id: new Date().getTime() },
                    (err, result) => {
                        if (err) reject(err)
                        else resolve(result)
                    }
                )
            }
        )
    })
)

contract('Test slowCancel', async () => {
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
            await increaseTime(announceDelay)
            const { logs } = await broker.slowCancel(sampleOfferHash)
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
            await increaseTime(announceDelay)
            await broker.slowCancel.sendTransaction(sampleOfferHash)
            await assertOfferParams(broker, emptyOfferParams, sampleOfferHash)

            const canCancelAt2 = await broker.announcedCancellations.call(sampleOfferHash)
            assert.equal(canCancelAt2.toNumber(), 0, 'Cancellation announcement is removed')
            await assertEtherBalance(broker, user, '1000000000000000000', 'Maker is refunded')
        })
    })

    contract('when insufficient time has passed', async () => {
        it('throws an error', async () => {
            await broker.announceCancel.sendTransaction(sampleOfferHash, { from: user })
            await increaseTime(announceDelay - 1000)
            await assertError(broker.slowCancel.sendTransaction, sampleOfferHash)
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
            await assertEtherBalance(broker, user, '999999999999999990')
        })
    })

    contract('when no cancellation has been announced', async () => {
        it('throws an error', async () => {
            await increaseTime(announceDelay)
            await assertError(broker.slowCancel.sendTransaction, sampleOfferHash)
            await assertOfferParams(broker, sampleOffer, sampleOfferHash)
            await assertEtherBalance(broker, user, '999999999999999990')
        })
    })
})
