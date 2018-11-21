/*
 * NB: since truffle-hdwallet-provider 0.0.5 you must wrap HDWallet providers in a
 * function when declaring them. Failure to do so will cause commands to hang. ex:
 * ```
 * mainnet: {
 *     provider: function() {
 *       return new HDWalletProvider(mnemonic, 'https://mainnet.infura.io/<infura-key>')
 *     },
 *     network_id: '1',
 *     gas: 4500000,
 *     gasPrice: 10000000000,
 *   },
 */

module.exports = {
    networks: {
        development: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*", // Match any network id
            gas: 8000000, // gas limit
            gasPrice: 1
        },
        ropsten: {
            provider: function () {
                const PrivateKeyProvider = require('truffle-privatekey-provider')
                return new PrivateKeyProvider(process.env.controlKey, "https://ropsten.infura.io/")
            },
            network_id: 3,
            gas: 8000000, // gas limit
            gasPrice: 10 * 1000000000
        },
        mainnet: {
            provider: function () {
                const PrivateKeyProvider = require('truffle-privatekey-provider')
                return new PrivateKeyProvider(process.env.controlKey, "https://mainnet.infura.io/")
            },
            network_id: 1,
            gas: 6000000, // gas limit
            gasPrice: 20 * 1000000000
        }
    },
    solc: {
        optimizer: {
            enabled: true,
            runs: 200
        }
    }
    // See <http://truffleframework.com/docs/advanced/configuration>
    // to customize your Truffle configuration!
};
