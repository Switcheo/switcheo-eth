const { ETHER_ADDR, REASON_CODES } = require('../constants')
const { web3, getBroker, validateBalance, testEvents } = require('../utils')

contract('Test deposit', async (accounts) => {
    let broker
    const user = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
    })

    contract('test event emission', async () => {
        it('emits events', async () => {
            const amount = web3.utils.toWei('1', 'ether')
            const result = await broker.deposit({ from: user, value: amount })
            testEvents(result, [
                'BalanceIncrease',
                {
                    user,
                    assetId: ETHER_ADDR,
                    amount,
                    reason: REASON_CODES.REASON_DEPOSIT,
                    nonce: 0
                }
            ])
        })
    })

    contract('when parameters are valid', async () => {
        it('deposits ETH into the contract', async () => {
            const amount = web3.utils.toWei('1', 'ether')

            await broker.deposit({ from: user, value: amount })
            await validateBalance(user, ETHER_ADDR, '1000000000000000000')

            await broker.deposit({ from: user, value: amount })
            await validateBalance(user, ETHER_ADDR, '2000000000000000000')
        })
    })
})
