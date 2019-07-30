const BrokerV2 = artifacts.require('BrokerV2')
const Scratchpad = artifacts.require('Scratchpad')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const DGTXCoin = artifacts.require('DGTX')
const ZEUSCoin = artifacts.require('ZEUS')

const EthCrypto = require('eth-crypto')
const { singletons } = require('openzeppelin-test-helpers');

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { soliditySha3, keccak256 } = web3.utils

const abiDecoder = require('abi-decoder')
abiDecoder.addABI(BrokerV2.abi)

const { DOMAIN_SEPARATOR, WITHDRAW_TYPEHASH } = require('./constants')

async function getBroker() { return await BrokerV2.deployed() }
async function getScratchpad() { return await Scratchpad.deployed() }
async function getJrc() { return await JRCoin.deployed() }
async function getSwc() { return await SWCoin.deployed() }
async function getDgtx() { return await DGTXCoin.deployed() }
async function getZeus(account) {
    await singletons.ERC1820Registry(account)
    return await ZEUSCoin.new()
}

function encodeParameters(types, values) {
    return web3.eth.abi.encodeParameters(types, values)
}

function ensureAddress(assetId) {
    if (assetId.address !== undefined) { return assetId.address }
    return assetId
}

async function validateBalance(user, assetId, amount) {
    assetId = ensureAddress(assetId)
    const broker = await getBroker()
    const balance = await broker.balances(user, assetId)
    assert.equal(balance.toString(), amount)
}

async function validateExternalBalance(user, token, amount) {
    user = ensureAddress(user)
    assert.equal((await token.balanceOf(user)).toString(), amount.toString())
}

async function assertRevert(promise) {
    try {
        await promise;
    } catch (error) {
        const revertFound = error.message.search('revert') >= 0;
        assert(revertFound, `Expected "revert", got ${error} instead`);
        return;
    }
    assert.fail('Expected an EVM revert but no error was encountered');
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

async function depositToken({ user, token, amount, nonce }) {
    const broker = await getBroker()
    await token.approve(broker.address, amount, { from: user })
    await broker.depositToken(user, token.address, nonce)
}

function parseSignature(signature) {
  var r = signature.substring(0, 64);
  var s = signature.substring(64, 128);
  var v = signature.substring(128, 130);

  return {
      v: parseInt(v, 16),
      r: '0x' + r,
      s: '0x' + s
  }
}

function getSignHash(hash) {
  const signHash = soliditySha3(
    { type: 'string', value: '\x19\x01' },
    { type: 'bytes32',  value: DOMAIN_SEPARATOR },
    { type: 'bytes32',  value: hash }
  )
  return signHash
}

async function sign(message, privateKey) {
    const signature = EthCrypto.sign(privateKey, message)
    return parseSignature(signature.substring(2))
}

async function signParameters(types, values, privateKey) {
    const encodedParams = keccak256(encodeParameters(types, values))
    const signHash = getSignHash(encodedParams)
    return await sign(signHash, privateKey)
}

async function withdraw({ user, assetId, amount, feeAssetId, feeAmount, nonce }, { privateKey }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    const broker = await getBroker()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [WITHDRAW_TYPEHASH, user, assetId, amount, feeAssetId, feeAmount, nonce],
        privateKey
    )
    return await broker.withdraw(user, assetId, amount, feeAssetId, feeAmount, nonce, v, r, s)
}

const exchange = {
    depositToken,
    withdraw
}

module.exports = {
    web3,
    getBroker,
    getJrc,
    getSwc,
    getDgtx,
    getZeus,
    getScratchpad,
    validateBalance,
    validateExternalBalance,
    assertRevert,
    decodeReceiptLogs,
    exchange,
}
