const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const DGTX = artifacts.require('DGTX')
const ZEUS = artifacts.require('ZEUS')

require('openzeppelin-test-helpers/configure')({ web3 })
const { singletons } = require('openzeppelin-test-helpers')

module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        if (network === 'development') {
            // in a test environment ERC777 tokens require
            // deploying an ERC1820 registry
            /* eslint-disable new-cap */
            await singletons.ERC1820Registry(accounts[0])
        }

        await deployer.deploy(JRCoin)
        await deployer.deploy(SWCoin)
        await deployer.deploy(DGTX)
        await deployer.deploy(ZEUS)
    })
}
