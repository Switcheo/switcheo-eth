const UniswapFactory = artifacts.require('UniswapFactory')
const BrokerUtils = artifacts.require('BrokerUtils')
const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(BrokerUtils)
        await deployer.link(BrokerUtils, BrokerV2)
        const providerAddresses = [
            (await UniswapFactory.deployed()).address, // placeholder for KyberSwap contract
            (await UniswapFactory.deployed()).address
        ]
        await deployer.deploy(BrokerV2, providerAddresses)
    })
}
