const { getBroker } = require('../utils')

contract('Test deploy', async (accounts) => {
    let broker
    const deployer = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
    })

    it('sets broker.owner as deployer', async () => {
        const owner = await broker.owner()
        assert.equal(owner, deployer)
    })

    it('sets deployer as admin', async () => {
        const isAdmin = await broker.isAdmin(deployer)
        assert.equal(isAdmin, true)
    })

    it('sets deployer as operator', async () => {
        const operator = await broker.operator()
        assert.equal(operator, deployer)
    })
})
