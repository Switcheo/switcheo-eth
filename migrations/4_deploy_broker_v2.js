const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')
const UniswapFactory = artifacts.require('UniswapFactory')

const KyberSwapDapp = artifacts.require('KyberSwapDapp')
const UniswapDapp = artifacts.require('UniswapDapp')

const TokenList = artifacts.require('TokenList')
const SpenderList = artifacts.require('SpenderList')

const Utils = artifacts.require('Utils')
const BrokerV2 = artifacts.require('BrokerV2')

async function getKyberNetworkProxyAddress(network) {
    if (network === 'development') {
        return (await KyberNetworkProxy.deployed()).address
    }
    if (network === 'ropsten') {
        return '0x818e6fecd516ecc3849daf6845e3ec868087b755'
    }
    return '0x818E6FECD516Ecc3849DAf6845e3EC868087B755'
}

async function getUniswapFactoryAddress(network) {
    if (network === 'development') {
        return (await UniswapFactory.deployed()).address
    }
    if (network === 'ropsten') {
        return '0x3157642d4287da5c3f92c785dfd67b3277e6f366'
    }
    return '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95'
}

module.exports = function(deployer, network) {
    deployer.then(async () => {
        await deployer.deploy(Utils)

        await deployer.link(Utils, TokenList)
        await deployer.link(Utils, SpenderList)

        await deployer.link(Utils, KyberSwapDapp)
        await deployer.link(Utils, UniswapDapp)

        await deployer.link(Utils, BrokerV2)

        const tokenList = await deployer.deploy(TokenList)
        const spenderList = await deployer.deploy(SpenderList)
        const kyberSwapDapp = await deployer.deploy(KyberSwapDapp, await getKyberNetworkProxyAddress(network))
        const uniswapDapp = await deployer.deploy(UniswapDapp, await getUniswapFactoryAddress(network))

        const broker = await deployer.deploy(BrokerV2, tokenList.address, spenderList.address)

        await spenderList.initializeBroker(broker.address)
        await tokenList.initializeBroker(broker.address)
        await kyberSwapDapp.initializeBroker(broker.address)
        await uniswapDapp.initializeBroker(broker.address)

        await broker.addMarketDapp(kyberSwapDapp.address)
        await broker.addMarketDapp(uniswapDapp.address)
    })
}
