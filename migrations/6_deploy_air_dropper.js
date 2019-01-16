const Broker = artifacts.require('Broker')
const AirDropper = artifacts.require('AirDropper')

module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        const { brokerAddress } = process.env
        const broker = brokerAddress ? await Broker.at(brokerAddress) : await Broker.deployed()
        await deployer.deploy(AirDropper, broker.address)
    })
};
