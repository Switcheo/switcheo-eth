const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const AtomicBroker = artifacts.require('AtomicBroker')

const { fundUser, createSwap, assertSwapParams } = require('../../utils/testUtils')

contract('Test createSwap', async (accounts) => {
    let broker, atomicBroker, jrCoin
    const owner = accounts[0]
    const coordinator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]

    beforeEach(async () => {
        broker = await Broker.deployed()
        atomicBroker = await AtomicBroker.deployed()
        jrCoin = await JRCoin.deployed()
    })

    contract('when valid values are used', async () => {
        it('creates a swap', async () => {
            await fundUser({ broker, user: maker, coordinator }, { jrc: 1000 })
            await broker.approveSpender(atomicBroker.address, { from: maker })
            const swapParams = {
                maker,
                taker,
                token: jrCoin.address,
                amount: 999,
                hashedSecret: '0x123',
                expiryTime: parseInt(Date.now() / 1000.0 + 60),
                feeAsset: jrCoin.address,
                feeAmount: 1,
                active: true
            }
            await createSwap(atomicBroker, swapParams)
            await assertSwapParams(atomicBroker, swapParams)
        })
    })
})
