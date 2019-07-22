const BrokerV2 = artifacts.require('BrokerV2')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')

const { ETHER_ADDR, web3, getBroker, getJrc, getSwc, validateBalance, decodeReceiptLogs } = require('../utils')

contract('Test depositToken', async (accounts) => {
    let broker, jrc, swc
    const user = accounts[0]

    beforeEach(async () => {
        broker = await getBroker()
        jrc = await getJrc()
        swc = await getSwc()

        await jrc.mint(user, 42)
    })

    it('updates user balance with the deposited amount', async () => {
        await jrc.approve(broker.address, 42, { from: user })
        const result = await broker.depositToken(user, jrc.address, 42)
        await validateBalance(user, jrc.address, 42)
    })
})
