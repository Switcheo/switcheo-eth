const AirDropper = artifacts.require('AirDropper')
const { BigNumber } = require('bignumber.js')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { assertError, assertEventEmission } = require('../../utils/testUtils')

contract('Test createSwap', async (accounts) => {
    let airDropper
    const id = web3.utils.keccak256('example-id')
    const coordinator = accounts[0]
    const funder = accounts[1]
    const receiver = accounts[2]
    const user = accounts[3]

    beforeEach(async () => {
        airDropper = await AirDropper.deployed()
        await airDropper.depositEther({ from: funder, value: 1000 })
    })

    contract('test event emission', async () => {
        it('emits a SendEther event', async () => {
            const result = await airDropper.sendEther(id, receiver, 1000)
            assertEventEmission(result.receipt.logs, [
                {
                    eventType: 'SendEther',
                    args: {
                        id,
                        receiver,
                        amount: 1000
                    }
                }
            ])
        })
    })

    contract('when valid values are used', async () => {
        it('sends ether to receiver', async () => {
            const amountBefore = new BigNumber(await web3.eth.getBalance(receiver))
            await airDropper.sendEther(id, receiver, 900)
            const amountAfter = new BigNumber(await web3.eth.getBalance(receiver))
            const amountReceived = (amountAfter).minus(amountBefore).toString()
            assert.equal(amountReceived, '900')
        })
    })

    contract('when contract has insufficient ether', async () => {
        it('raises an error', async () => {
            await airDropper.sendEther(id, receiver, 600)
            // should fail as the contract has insufficient ether to complete the airdrop
            const newId = web3.utils.keccak256('new-id')
            await assertError(airDropper.sendEther, newId, receiver, 600)
        })
    })

    contract('when the id has been used before', async () => {
        it('raises an error', async () => {
            await airDropper.sendEther(id, receiver, 300)
            await assertError(airDropper.sendEther, id, receiver, 300)
        })
    })

    contract('when the sender is not the coordinator', async () => {
        it('raises an error', async () => {
            await assertError(airDropper.sendEther, id, receiver, 300, { from: user })
        })
    })
})
