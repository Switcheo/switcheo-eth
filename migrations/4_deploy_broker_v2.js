const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.deploy(BrokerV2)
};
