const TransferCheck = artifacts.require('TransferCheck')

module.exports = function(deployer) {
    deployer.then(async () => {
        await deployer.deploy(TransferCheck)
    })
}
