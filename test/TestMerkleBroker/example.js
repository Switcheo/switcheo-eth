const MerkleBroker = artifacts.require('MerkleBroker')

contract('Example', async (accounts) => {
    let merkleBroker

    beforeEach(async () => {
        merkleBroker = await MerkleBroker.deployed()
    })

    it('processes deposits', async () => {
        const hashes = [
            '0xc80575b24f0bd61ab21b4f7089ceceeb97164aeb8fb95212e9cf6e4c39c00012',
            '0xf36f7832f885a8ec6a05b41cc48042ca29fa8e6b8ca37224864b5b6031ced4cd',
            '0xf36f7832f885a8ec6a05b41cc48042ca29fa8e6b8ca37224864b5b6031ced4cd',
            '0xf36f7832f885a8ec6a05b41cc48042ca29fa8e6b8ca37224864b5b6031ced4cd'
        ]
        const result = await merkleBroker.testHash(hashes)
        console.log('result', result.receipt.gasUsed)
    })
})
