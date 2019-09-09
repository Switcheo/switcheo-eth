const { getSpenderList, assertReversion } = require('../utils')

contract('Test whitelistSpender', async (accounts) => {
    let spenderList
    const spender = accounts[2]

    beforeEach(async () => {
        spenderList = await getSpenderList()
    })

    it('whitelists a spender', async () => {
        await assertReversion(spenderList.validateSpender(spender), 'Invalid spender')

        await spenderList.whitelistSpender(spender)
        await spenderList.validateSpender(spender)
    })
})
