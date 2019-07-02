const MerkleBroker = artifacts.require('MerkleBroker')

contract('Example', async (accounts) => {
    let merkleBroker

    beforeEach(async () => {
        merkleBroker = await MerkleBroker.deployed()
    })

    it('processes deposits', async () => {
    })
})
