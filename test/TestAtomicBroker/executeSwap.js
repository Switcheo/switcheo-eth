const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const AtomicBroker = artifacts.require('AtomicBroker')

const { fundUser, createSwap, assertSwapParams, getSampleSwapParams,
        assertTokenBalance, assertError } = require('../../utils/testUtils')

contract('Test executeSwap', async (accounts) => {
    let broker, atomicBroker, token, secondToken, swapParams
    const owner = accounts[0]
    const coordinator = accounts[0]
    const operator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
        token = await JRCoin.deployed()
        secondToken = await SWCoin.deployed()
        await fundUser({ broker, user: maker, coordinator }, { jrc: 1000 })
        await broker.approveSpender(atomicBroker.address, { from: maker })
        swapParams = getSampleSwapParams({ maker, taker, token })
        await createSwap(atomicBroker, swapParams)
        assertSwapParams(atomicBroker, swapParams, swapParams.hashedSecret)
    })

    contract('when valid values are used', async () => {
        it('executes a swap', async () => {
            await assertTokenBalance(broker, maker, token.address, 1)
            await assertTokenBalance(broker, taker, token.address, 0)
            await assertTokenBalance(broker, atomicBroker.address, token.address, 999)

            await atomicBroker.executeSwap(swapParams.hashedSecret, swapParams.secret)

            await assertTokenBalance(broker, maker, token.address, 1)
            await assertTokenBalance(broker, taker, token.address, 998)
            await assertTokenBalance(broker, operator, token.address, 1)
            await assertTokenBalance(broker, atomicBroker.address, token.address, 0)
        })
    })

    contract('when the preimage does not matched the hashedSecret', async () => {
        it('throws an error', async () => {
            assertError(atomicBroker.executeSwap, swapParams.hashedSecret, '0xabc')
        })
    })
})
