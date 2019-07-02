const MerkleBroker = artifacts.require('MerkleBroker')

module.exports = function(deployer) {
    deployer.deploy(MerkleBroker)
};
