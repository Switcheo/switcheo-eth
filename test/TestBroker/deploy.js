const Broker = artifacts.require('Broker')

contract('Test deploy', async (accounts) => {
    let broker

    beforeEach(async () => {
        broker = await Broker.deployed()
    })

    it('has cancelAnnounceDelay as 604800', async () => {
        const cancelAnnounceDelay = await broker.cancelAnnounceDelay.call()
        assert.equal(cancelAnnounceDelay, 604800)
    })

    it('has withdrawAnnounceDelay as 604800', async () => {
        const withdrawAnnounceDelay = await broker.withdrawAnnounceDelay.call()
        assert.equal(withdrawAnnounceDelay, 604800)
    })

    it('has owner as deployer', async () => {
        const owner = await broker.owner.call()
        const deployer = accounts[0]
        assert.equal(owner, deployer)
    })

    it('has coordinator as deployer', async () => {
        const coordinator = await broker.coordinator.call()
        const deployer = accounts[0]
        assert.equal(coordinator, deployer)
    })

    it('has operator as deployer', async () => {
        const operator = await broker.operator.call()
        const deployer = accounts[0]
        assert.equal(operator, deployer)
    })

    it('has state as Active', async () => {
        const state = await broker.state.call()
        assert.equal(state.toNumber(), 0)
    })
})
