const KyberNetworkProxy = artifacts.require('KyberNetworkProxy')

module.exports = function(deployer) {
    deployer.deploy(KyberNetworkProxy)
}
