const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')

const { assertError } = require('../../utils/brokerUtils')

contract('Test setCancelDelay', async (accounts) => {
    let broker, atomicBroker
    const owner = accounts[0]
    const notOwner = accounts[1]

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
    })

    it('allows broker.owner to set cancelDelay', async () => {
        await atomicBroker.setCancelDelay(2000, { from: owner })
        const cancelDelay = await atomicBroker.cancelDelay.call()
        assert.equal(cancelDelay, 2000)
    })

    it('throws an error if msg.sender is not broker.owner', async () => {
        await assertError(atomicBroker.setCancelDelay, 2000, { from: notOwner })
    })
})
