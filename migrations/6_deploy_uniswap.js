const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const UniswapFactory = artifacts.require('UniswapFactory')
const UniswapExchange = artifacts.require('UniswapExchange')

async function deployUniswapExchange(deployer, token) {
    const factory = await UniswapFactory.deployed()
    const exchange = await deployer.deploy(UniswapExchange, token.address)
    await factory.registerExchange(exchange.address, token.address)
}

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(UniswapFactory)
        await deployUniswapExchange(deployer, await JRCoin.deployed())
        await deployUniswapExchange(deployer, await SWCoin.deployed())
    })
}
