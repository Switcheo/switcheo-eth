const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')
const UniswapFactory = artifacts.require('UniswapFactory')
const BrokerUtils = artifacts.require('BrokerUtils')
const TokenList = artifacts.require('TokenList')
const SpenderList = artifacts.require('SpenderList')
const BrokerV2 = artifacts.require('BrokerV2')

module.exports = function(deployer) {
    deployer.then(async () => {
        const tokenList = await deployer.deploy(TokenList)
        const spenderList = await deployer.deploy(SpenderList)

        await deployer.deploy(BrokerUtils)
        await deployer.link(BrokerUtils, BrokerV2)

        const broker = await deployer.deploy(BrokerV2, tokenList.address, spenderList.address)

        await spenderList.setBrokerAddress(broker.address)
        await tokenList.setBrokerAddress(broker.address)

        await broker.addMarketDapp((await KyberNetworkProxy.deployed()).address)
        await broker.addMarketDapp((await UniswapFactory.deployed()).address)
    })
}
