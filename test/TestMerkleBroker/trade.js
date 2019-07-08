const MerkleBroker = artifacts.require('MerkleBroker')

contract('Example', async (accounts) => {
    let merkleBroker
    const t1 = '0x123'
    const t2 = '0x456'
    const maker = accounts[1]
    const taker = accounts[2]

    beforeEach(async () => {
        merkleBroker = await MerkleBroker.deployed()
    })

    contract('trade', async () => {
        it('performs a trade', async () => {
            await merkleBroker.deposit(maker, t1, 10) // 46005 for gas use
            await merkleBroker.deposit(taker, t2, 5)
            await merkleBroker.trade([1, 2])
        })
    })
})
