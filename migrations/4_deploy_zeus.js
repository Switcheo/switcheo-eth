// https://forum.openzeppelin.com/t/simple-erc777-token-example/746
const ZEUS = artifacts.require('ZEUS')
require('openzeppelin-test-helpers/configure')({ web3 })
const { singletons } = require('openzeppelin-test-helpers')

module.exports = async function(deployer, network, accounts) {
    deployer.then(async () => {
        if (network === 'development') {
            // in a test environment an ERC777 token requires
            // deploying an ERC1820 registry
            /* eslint-disable new-cap */
            await singletons.ERC1820Registry(accounts[0])
        }
        deployer.deploy(ZEUS)
    })
}
