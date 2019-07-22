const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const ETHER_ADDR = '0x0000000000000000000000000000000000000000'

module.exports = {
    web3,
    ETHER_ADDR,
}
