const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')

module.exports = function(deployer) {
    deployer.then(async () => {
        const kyberNetworkProxy = await deployer.deploy(KyberNetworkProxy)
        await kyberNetworkProxy.setKyberNetworkContract(kyberNetworkProxy.address)
    })
}
