const UniswapFactory = artifacts.require('UniswapFactory')
const UniswapExchange = artifacts.require('UniswapExchange')

function ensureAddress(assetId) {
    if (assetId.address !== undefined) { return assetId.address }
    return assetId
}

async function getUniswapExchange(assetId) {
    assetId = ensureAddress(assetId)
    const factory = await UniswapFactory.deployed()
    const exchangeAddress = await factory.getExchange(assetId)
    return UniswapExchange.at(exchangeAddress)
}

async function fundUniswapExchange(token, assetAmount, etherAmount, user) {
    const exchange = await getUniswapExchange(token)
    await exchange.deposit({ from: user, value: etherAmount })

    await token.mint(user, assetAmount)
    await token.transfer(exchange.address, assetAmount, { from: user })
}

module.exports = {
    getUniswapExchange,
    fundUniswapExchange
}
