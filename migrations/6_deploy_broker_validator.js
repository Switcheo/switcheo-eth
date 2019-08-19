const BrokerValidator = artifacts.require('BrokerValidator')

module.exports = function(deployer) {
    deployer.deploy(BrokerValidator)
};
