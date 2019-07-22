const BrokerV2 = artifacts.require('BrokerV2')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const Scratchpad = artifacts.require('Scratchpad')

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const abiDecoder = require('abi-decoder')
abiDecoder.addABI(BrokerV2.abi)

const ETHER_ADDR = '0x0000000000000000000000000000000000000000'

async function getBroker() { return await BrokerV2.deployed() }
async function getJrc() { return await JRCoin.deployed() }
async function getSwc() { return await SWCoin.deployed() }
async function getScratchpad() { return await Scratchpad.deployed() }

async function validateBalance(user, assetId, amount) {
    const broker = await getBroker()
    const balance = await broker.balances(user, assetId)
    assert.equal(balance.toString(), amount)
}

function decodeReceiptLogs(receiptLogs) {
    const logs = abiDecoder.decodeLogs(receiptLogs)
    const decodedLogs = []
    for (const log of logs) {
        const decodedLog = { event: log.name, args: {} }
        for (const event of log.events) {
            decodedLog.args[event.name] = event.value
        }
        decodedLogs.push(decodedLog)
    }
    return decodedLogs
}

module.exports = {
    web3,
    ETHER_ADDR,
    getBroker,
    getJrc,
    getSwc,
    getScratchpad,
    validateBalance,
    decodeReceiptLogs,
}
