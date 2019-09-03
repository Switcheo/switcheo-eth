const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')
const UniswapFactory = artifacts.require('UniswapFactory')

const KyberSwapDapp = artifacts.require('KyberSwapDapp')
const UniswapDapp = artifacts.require('UniswapDapp')

const TokenList = artifacts.require('TokenList')
const SpenderList = artifacts.require('SpenderList')

const Utils = artifacts.require('Utils')
const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(Utils)
        await deployer.link(Utils, BrokerV2)
        await deployer.link(Utils, KyberSwapDapp)
        await deployer.link(Utils, UniswapDapp)

        const tokenList = await deployer.deploy(TokenList)
        const spenderList = await deployer.deploy(SpenderList)
        const kyberSwapDapp = await deployer.deploy(KyberSwapDapp, (await KyberNetworkProxy.deployed()).address)
        const uniswapDapp = await deployer.deploy(UniswapDapp, (await UniswapFactory.deployed()).address)

        const broker = await deployer.deploy(BrokerV2, tokenList.address, spenderList.address)

        await spenderList.setBroker(broker.address)
        await tokenList.setBroker(broker.address)
        await kyberSwapDapp.setBroker(broker.address)
        await uniswapDapp.setBroker(broker.address)

        await broker.addMarketDapp(kyberSwapDapp.address)
        await broker.addMarketDapp(uniswapDapp.address)
    })
}
