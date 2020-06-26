const Utils = artifacts.require('Utils')
const UniswapDappV2 = artifacts.require('UniswapDappV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(Utils)
        await deployer.link(Utils, UniswapDappV2)

        // https://uniswap.org/docs/v2/smart-contracts/router02/
        const routerAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
        // dev ropsten broker
        const brokerAddress = '0xfe76be890a14921fe09682eccea416b708d620d3'
        const uniswapDappV2 = await deployer.deploy(UniswapDappV2, routerAddress)
        await uniswapDappV2.initializeBroker(brokerAddress)
    })
}
