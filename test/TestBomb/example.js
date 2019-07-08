const BOMBv3 = artifacts.require('BOMBv3')

contract('Example', async (accounts) => {
    let bombToken

    beforeEach(async () => {
        bombToken = await BOMBv3.deployed()
    })

    it('processes deposits', async () => {
        console.log('bombToken', bombToken.address)
        // const hashes = [
        //     '0xc80575b24f0bd61ab21b4f7089ceceeb97164aeb8fb95212e9cf6e4c39c00012',
        //     '0xc80575b24f0bd61ab21b4f7089ceceeb97164aeb8fb95212e9cf6e4c39c00012',
        // ]
        // const result = await merkleBroker.testHash(hashes[0])
        // const result = await merkleBroker.testHash()
        // console.log('result', result.receipt.gasUsed)
        const supply = await bombToken.totalSupply()
        console.log('supply', supply.toString())
    })
})
