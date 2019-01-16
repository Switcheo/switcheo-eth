const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')

contract('Test deploy', async (accounts) => {
    let broker, atomicBroker

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
    })

    it('has the broker approved to spend its balance', async () => {
        const approved = await broker.approvedSpenders(atomicBroker.address, atomicBroker.address)
        assert.equal(approved, true);
    })
})
