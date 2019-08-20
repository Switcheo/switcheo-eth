const BrokerValidations = artifacts.require('BrokerValidations')
const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(BrokerValidations)
        await deployer.link(BrokerValidations, BrokerV2)
        await deployer.deploy(BrokerV2)
    })
}
