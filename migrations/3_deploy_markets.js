const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')
const UniswapFactory = artifacts.require('UniswapFactory')
const UniswapExchange = artifacts.require('UniswapExchange')

async function deployUniswapExchange(deployer, token) {
    const factory = await UniswapFactory.deployed()
    const exchange = await deployer.deploy(UniswapExchange, token.address, factory.address)
    await factory.registerExchange(exchange.address, token.address)
}

module.exports = function(deployer) {
    deployer.then(async () => {
        const kyberNetworkProxy = await deployer.deploy(KyberNetworkProxy)
        await kyberNetworkProxy.setKyberNetworkContract(kyberNetworkProxy.address)

        await deployer.deploy(UniswapFactory)
        await deployUniswapExchange(deployer, await JRCoin.deployed())
        await deployUniswapExchange(deployer, await SWCoin.deployed())
    })
}
