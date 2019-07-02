const MerkleBroker = artifacts.require('MerkleBroker')

contract('Example', async (accounts) => {
    let merkleBroker

    beforeEach(async () => {
        merkleBroker = await MerkleBroker.deployed()
    })

    it('processes deposits', async () => {
        const hashes = [
            '0xc80575b24f0bd61ab21b4f7089ceceeb97164aeb8fb95212e9cf6e4c39c00012',
            '0xc80575b24f0bd61ab21b4f7089ceceeb97164aeb8fb95212e9cf6e4c39c00012',
        ]
        const result = await merkleBroker.testHash(hashes)
        console.log('result', result.receipt.gasUsed)
    })
})
