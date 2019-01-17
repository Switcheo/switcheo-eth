const Broker = artifacts.require('Broker')

module.exports = function(deployer) {
    deployer.deploy(Broker)
};
