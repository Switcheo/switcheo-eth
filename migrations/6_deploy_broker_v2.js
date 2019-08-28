const BrokerUtils = artifacts.require('BrokerUtils')
const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(BrokerUtils)
        await deployer.link(BrokerUtils, BrokerV2)
        await deployer.deploy(BrokerV2)
    })
}
