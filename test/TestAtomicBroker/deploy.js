const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')

contract('Test deploy', async (accounts) => {
    let broker, atomicBroker

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
    })

    it('has cancelDelay as 604800', async () => {
        const cancelDelay = await atomicBroker.cancelDelay.call()
        assert.equal(cancelDelay, 604800)
    })
})
