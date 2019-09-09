const { getBroker, getSpenderList, assertAsync, assertReversion } = require('../utils')

contract('Test spendFrom', async (accounts) => {
    let broker, spenderList
    const spender = accounts[1]

    beforeEach(async () => {
        broker = await getBroker()
        spenderList = await getSpenderList()
    })

    contract('when parameters are valid', async () => {
        it('marks a nonce as used', async () => {
            await spenderList.whitelistSpender(spender)
            await assertAsync(broker.usedNonces(0), 0)
            await broker.markNonce(2, { from: spender })
            await assertAsync(broker.usedNonces(0), 4) // 100
            await broker.markNonce(5, { from: spender })
            await assertAsync(broker.usedNonces(0), 36) // 100100
        })
    })

    contract('when the msg.sender is not a whitelisted spender', async () => {
        it('raises an error', async () => {
            await assertReversion(broker.markNonce(2), 'Invalid spender')
        })
    })
})
