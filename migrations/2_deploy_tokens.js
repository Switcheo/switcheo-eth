const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const DGTX = artifacts.require('DGTX')
const ZEUS = artifacts.require('ZEUS')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(JRCoin)
        await deployer.deploy(SWCoin)
        await deployer.deploy(DGTX)
        await deployer.deploy(ZEUS)
    })
}
