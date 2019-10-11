const { getTokenList, getJrc, assertReversion } = require('../utils')

contract('Test unwhitelistToken', async (accounts) => {
    let tokenList, jrc

    beforeEach(async () => {
        tokenList = await getTokenList()
        jrc = await getJrc()
    })

    it('unwhitelists a token', async () => {
        await assertReversion(tokenList.validateToken(jrc.address), 'Invalid token')

        await tokenList.whitelistToken(jrc.address)
        await tokenList.validateToken(jrc.address)

        await tokenList.unwhitelistToken(jrc.address)
        await assertReversion(tokenList.validateToken(jrc.address), 'Invalid token')
    })
})
