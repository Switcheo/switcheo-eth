const Lab = artifacts.require('Lab')

async function printGasUsed(promise, label) {
    const result = await promise
    console.log(label, result.receipt.gasUsed)
}

contract('Test gas costs', async (accounts) => {
    let lab
    const user = accounts[0]

    beforeEach(async () => {
        lab = await Lab.deployed()
    })

    contract('noop', async () => {
        it('prints gas used', async () => {
            await printGasUsed(lab.noop(), 'lab.noop')
        })
    })

    contract('incrementBalance', async () => {
        it('prints gas used', async () => {
            await printGasUsed(lab.incrementBalance(10), 'lab.incrementBalance 1')
            await printGasUsed(lab.incrementBalance(20), 'lab.incrementBalance 2')
        })
    })

    contract('batchIncrementBalance', async () => {
        it('prints gas used', async () => {
            await printGasUsed(lab.batchIncrementBalance(10), 'lab.batchIncrementBalance 1')
            await printGasUsed(lab.batchIncrementBalance(20), 'lab.batchIncrementBalance 2')
        })
    })
})
