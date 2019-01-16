const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')

module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        const { brokerAddress } = process.env
        const broker = brokerAddress ? await Broker.at(brokerAddress) : await Broker.deployed()

        await deployer.deploy(AtomicBroker, broker.address)
        const atomicBroker = await AtomicBroker.deployed()

        const owner = accounts[0]

        await broker.addSpender(atomicBroker.address, { from: owner })
        await atomicBroker.approveBroker({ from: owner })
    })
};
