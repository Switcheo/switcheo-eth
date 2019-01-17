const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')

module.exports = function(deployer) {
    deployer.then(async () => {
        const broker = await Broker.deployed()
        return deployer.deploy(AtomicBroker, broker.address)
    })
};
