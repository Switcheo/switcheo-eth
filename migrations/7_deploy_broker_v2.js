const BrokerValidator = artifacts.require('BrokerValidator')
const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        const { validatorAddress } = process.env
        const validator = validatorAddress ? await BrokerValidator.at(validatorAddress) : await BrokerValidator.deployed()
        await deployer.deploy(BrokerV2, validator.address)
    })
};
