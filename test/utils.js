const BrokerV2 = artifacts.require('BrokerV2')
const Scratchpad = artifacts.require('Scratchpad')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const DGTXCoin = artifacts.require('DGTX')
const ZEUSCoin = artifacts.require('ZEUS')

const EthCrypto = require('eth-crypto')
const { singletons } = require('openzeppelin-test-helpers');
const { sha256 } = require('js-sha256')

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { soliditySha3, keccak256 } = web3.utils

const abiDecoder = require('abi-decoder')
abiDecoder.addABI(BrokerV2.abi)

const { DOMAIN_SEPARATOR, TYPEHASHES } = require('./constants')

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
    for (let i = 0; i < values.length; i++) {
        const valueLabel = `values[${i}]`
        if (values[i] === undefined) { throw new Error(valueLabel + ' is undefined') }
        if (values[i] === null) { throw new Error(valueLabel + ' is null') }
        if (typeof values[i] === 'object') { throw new Error(valueLabel + ' is an object') }
    }
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

async function getEvmTime() {
    const blockNumber = await web3.eth.getBlockNumber()
    const block = await web3.eth.getBlock(blockNumber)
    return block.timestamp
}

async function increaseEvmTime(time) {
  await web3.currentProvider.send('evm_increaseTime', [time])
  await web3.currentProvider.send('evm_mine', [])
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

async function assertAsync(promise, value) {
    return await assert.equal(await promise, value)
}

function hashSecret(secret) {
    return '0x' + sha256(web3.utils.hexToBytes('0x' + sha256(secret)))
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
    user = ensureAddress(user)
    const broker = await getBroker()
    await token.approve(broker.address, amount, { from: user })
    await broker.depositToken(user, token.address, nonce)
}

async function mintAndDeposit({ user, token, amount, nonce }) {
    await token.mint(user, amount)
    await depositToken({ user, token, amount, nonce })
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
    if (privateKey === undefined) {
        throw new Error('privateKey must be provided')
    }
    const encodedParams = keccak256(encodeParameters(types, values))
    const signHash = getSignHash(encodedParams)
    return await sign(signHash, privateKey)
}

async function authorizeSpender({ user, spender, nonce }, { privateKey }) {
    const broker = await getBroker()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'uint256'],
        [TYPEHASHES.AUTHORIZE_SPENDER_TYPEHASH, user, spender, nonce],
        privateKey
    )
    return await broker.authorizeSpender(user, spender, nonce, v, r, s)
}

async function withdraw({ user, assetId, amount, feeAssetId, feeAmount, nonce }, { privateKey }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    user = ensureAddress(user)
    const broker = await getBroker()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [TYPEHASHES.WITHDRAW_TYPEHASH, user, assetId, amount, feeAssetId, feeAmount, nonce],
        privateKey
    )
    return await broker.withdraw(user, assetId, amount, feeAssetId, feeAmount, nonce, v, r, s)
}

async function trade({ makes, fills, matches }, { privateKeys }) {
    const broker = await getBroker()
    const addresses = []
    const values = []
    const hashes = []
    const vArray = []

    for (let i = 0; i < makes.length; i++) {
        const make = makes[i]
        const { maker, offerAssetId, wantAssetId, feeAssetId } = make
        const { offerAmount, wantAmount, feeAmount, nonce } = make
        const privateKey = privateKeys[maker]

        const { v, r, s } = await signParameters(
            ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256', 'address', 'uint256', 'uint256'],
            [TYPEHASHES.OFFER_TYPEHASH, maker, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount, nonce],
            privateKey
        );

        addresses.push(maker, offerAssetId, wantAssetId, feeAssetId)
        values.push(offerAmount, wantAmount, feeAmount, nonce)
        hashes.push(r, s)
        vArray.push(v)
    }

    for (let i = 0; i < fills.length; i++) {
        const fill = fills[i]
        const { filler, offerAssetId, wantAssetId, feeAssetId } = fill
        const { offerAmount, wantAmount, feeAmount, nonce } = fill
        const privateKey = privateKeys[filler]

        const { v, r, s } = await signParameters(
            ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256', 'address', 'uint256', 'uint256'],
            [TYPEHASHES.FILL_TYPEHASH, filler, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount, nonce],
            privateKey
        );

        addresses.push(filler, offerAssetId, wantAssetId, feeAssetId)
        values.push(offerAmount, wantAmount, feeAmount, nonce)
        hashes.push(r, s)
        vArray.push(v)
    }

    matches.unshift(makes.length)

    return await broker.trade(addresses, values, hashes, matches, vArray)
}

function hashSwap({ maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    return keccak256(encodeParameters(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'bytes32', 'uint256', 'address', 'uint256', 'uint256'],
        [TYPEHASHES.SWAP_TYPEHASH, maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce]
    ))
}

async function createSwap({ maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce }, { privateKey }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    const broker = await getBroker()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'bytes32', 'uint256', 'address', 'uint256', 'uint256'],
        [TYPEHASHES.SWAP_TYPEHASH, maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce],
        privateKey
    )
    const addresses = [maker, taker, assetId, feeAssetId]
    const values = [amount, expiryTime, feeAmount, nonce]
    const hashes = [hashedSecret, r, s]
    return await broker.createSwap(addresses, values, hashes, v)
}

async function executeSwap({ maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce, secret }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    const broker = await getBroker()
    const addresses = [maker, taker, assetId, feeAssetId]
    const values = [amount, expiryTime, feeAmount, nonce]
    return await broker.executeSwap(addresses, values, hashedSecret, web3.utils.utf8ToHex(secret))
}

async function cancelSwap({ maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce, cancelFeeAmount }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    const broker = await getBroker()
    const addresses = [maker, taker, assetId, feeAssetId]
    const values = [amount, expiryTime, feeAmount, nonce]
    return await broker.cancelSwap(addresses, values, hashedSecret, cancelFeeAmount)
}

const exchange = {
    authorizeSpender,
    mintAndDeposit,
    depositToken,
    trade,
    withdraw,
    createSwap,
    executeSwap,
    cancelSwap,
}

module.exports = {
    web3,
    getBroker,
    getJrc,
    getSwc,
    getDgtx,
    getZeus,
    getScratchpad,
    hashSecret,
    validateBalance,
    validateExternalBalance,
    assertRevert,
    assertAsync,
    getEvmTime,
    increaseEvmTime,
    decodeReceiptLogs,
    hashSwap,
    exchange,
}
