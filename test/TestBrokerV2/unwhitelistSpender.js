const { getSpenderList, assertReversion } = require('../utils')

contract('Test unwhitelistSpender', async (accounts) => {
    let spenderList
    const spender = accounts[2]

    beforeEach(async () => {
        spenderList = await getSpenderList()
    })

    it('unwhitelists a spender', async () => {
        await assertReversion(spenderList.validateSpender(spender), 'Invalid spender')

        await spenderList.whitelistSpender(spender)
        await spenderList.validateSpender(spender)

        await spenderList.unwhitelistSpender(spender)
        await assertReversion(spenderList.validateSpender(spender), 'Invalid spender')
    })
})
