const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')

async function getKyberSwapExchange(assetId) {
    return KyberNetworkProxy.deployed()
}

async function fundKyberSwapExchange(token, assetAmount, etherAmount, user) {
    const exchange = await getKyberSwapExchange()
    await exchange.deposit({ from: user, value: etherAmount })

    await token.mint(user, assetAmount)
    await token.transfer(exchange.address, assetAmount, { from: user })
}

module.exports = {
    getKyberSwapExchange,
    fundKyberSwapExchange
}
