const BrokerV2 = artifacts.require('BrokerV2')
const Scratchpad = artifacts.require('Scratchpad')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const DGTXCoin = artifacts.require('DGTX')
const ZEUSCoin = artifacts.require('ZEUS')

const BN = require('bn.js')
const EthCrypto = require('eth-crypto')
const { singletons } = require('openzeppelin-test-helpers')
const { sha256 } = require('js-sha256')

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { soliditySha3, keccak256 } = web3.utils

const abiDecoder = require('abi-decoder')
abiDecoder.addABI(BrokerV2.abi)

const { DOMAIN_SEPARATOR, TYPEHASHES, ZERO_ADDR, ETHER_ADDR } = require('../constants')

async function getBroker() { return await BrokerV2.deployed() }
async function getScratchpad() { return await Scratchpad.deployed() }
async function getJrc() { return await JRCoin.deployed() }
async function getSwc() { return await SWCoin.deployed() }
async function getDgtx() { return await DGTXCoin.deployed() }
async function getZeus(account) {
    /* eslint-disable new-cap */
    await singletons.ERC1820Registry(account)
    return await ZEUSCoin.new()
}

function bn(value) { return new BN(value) }
function shl(value, n) { return bn(value).shln(n) }

function clone(obj) { return JSON.parse(JSON.stringify(obj)) }

function printLogs(result, events) {
    const { logs } = result.receipt

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        let print = false
        for (let j = 0; j < events.length; j++) {
            if (log.event === events[j]) {
                print = true
                break
            }
        }

        if (print) {
            const values = {}
            for (const key in log.args) {
                if (key === '__length__') { continue }
                if (key === '0') { continue }
                if (!isNaN(parseInt(key))) { continue }

                values[key] = log.args[key]
                if (values[key].toString !== undefined) {
                    values[key] = values[key].toString()
                }
            }
            console.log('log', log.event, values)
        }
    }
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

function assertEqual(valueA, valueB) {
    if (valueA.toString !== undefined) { valueA = valueA.toString() }
    if (valueB.toString !== undefined) { valueB = valueB.toString() }
    assert.equal(valueA, valueB)
}

async function assertAsync(promise, value) {
    const result = await promise
    assertEqual(result, value)
}

async function validateBalance(user, assetId, amount) {
    assetId = ensureAddress(assetId)
    const broker = await getBroker()
    const balance = await broker.balances(user, assetId)
    assertEqual(balance, amount)
}

async function validateExternalBalance(user, token, amount) {
    user = ensureAddress(user)
    if (token === ETHER_ADDR) { return await web3.eth.getBalance(user) }
    await assertAsync(token.balanceOf(user), amount)
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

async function assertReversion(promise, errorMessage) {
    try {
        await promise
    } catch (error) {
        const revertFound = error.message.search('revert') >= 0
        assert(revertFound, `Expected "revert", got ${error} instead`)
        if (errorMessage !== undefined) {
            const messageFound = error.message.search(errorMessage) >= 0
            assert(messageFound, `Expected "${errorMessage}", got ${error} instead`)
        }
        return
    }
    assert.fail('Expected an EVM revert but no error was encountered')
}

async function testValidation(method, params, fail, pass, errorMessage) {
    if (!Array.isArray(fail)) { fail = [fail] }
    if (!Array.isArray(pass)) { pass = [pass] }
    await assertReversion(method(...[...params, ...fail]), errorMessage)
    await method(...[...params, ...pass])
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

async function depositToken({ user, token, amount, expectedAmount, nonce }) {
    if (expectedAmount === undefined) { expectedAmount = amount }
    user = ensureAddress(user)
    const broker = await getBroker()
    await token.approve(broker.address, amount, { from: user })
    await broker.depositToken(user, token.address, amount, expectedAmount, nonce)
}

async function mintAndDeposit({ user, token, amount, nonce }) {
    await token.mint(user, amount)
    await depositToken({ user, token, amount, nonce })
}

function parseSignature(signature) {
  const r = signature.substring(0, 64)
  const s = signature.substring(64, 128)
  const v = signature.substring(128, 130)

  return {
      v: parseInt(v, 16),
      r: '0x' + r,
      s: '0x' + s
  }
}

function getSignHash(hash) {
  const signHash = soliditySha3(
    { type: 'string', value: '\x19\x01' },
    { type: 'bytes32', value: DOMAIN_SEPARATOR },
    { type: 'bytes32', value: hash }
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
    return await broker.authorizeSpender(user, spender, nonce, v, r, s, false)
}

async function withdraw({ user, receivingAddress, assetId, amount, feeAssetId, feeAmount, nonce }, { privateKey }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    user = ensureAddress(user)
    const broker = await getBroker()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [TYPEHASHES.WITHDRAW_TYPEHASH, user, receivingAddress, assetId, amount, feeAssetId, feeAmount, nonce],
        privateKey
    )
    return await broker.withdraw(user, receivingAddress, assetId, amount, feeAssetId, feeAmount, nonce, v, r, s, false)
}

async function cancel(
    {
        maker, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount,
        nonce, expectedAvailableAmount, cancelFeeAssetId, cancelFeeAmount
    },
    { privateKey }
)
{
    const broker = await getBroker()
    const offerHash = hashOffer({
        maker, offerAssetId, offerAmount, wantAssetId, wantAmount,
        feeAssetId, feeAmount, nonce
    })

    const { v, r, s } = await signParameters(
        ['bytes32', 'bytes32', 'address', 'uint256'],
        [TYPEHASHES.CANCEL_TYPEHASH, offerHash, cancelFeeAssetId, cancelFeeAmount],
        privateKey
    )
    const values = [
        bn(offerAmount).or(shl(wantAmount, 128)),
        bn(feeAmount).or(shl(cancelFeeAmount, 128)),
        bn(expectedAvailableAmount).or(shl(v, 136))
                                   .or(shl(nonce, 144))
    ]
    const hashes = [r, s]
    const addresses = [maker, offerAssetId, wantAssetId, feeAssetId, cancelFeeAssetId]
    return await broker.cancel(values, hashes, addresses)
}

async function adminCancel(
    {
        maker, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount,
        nonce, expectedAvailableAmount
    }
)
{
    const broker = await getBroker()
    return await broker.adminCancel(
        maker, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount,
        nonce, expectedAvailableAmount
    )
}

async function announceCancel(
    {
        maker, offerAssetId, offerAmount, wantAssetId, wantAmount,
        feeAssetId, feeAmount, nonce
    },
    { from }
)
{
    const broker = await getBroker()
    return await broker.announceCancel(maker, offerAssetId, offerAmount, wantAssetId, wantAmount,
                                       feeAssetId, feeAmount, nonce, { from })
}

async function slowCancel({ maker, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount, nonce }) {
    const broker = await getBroker()
    return await broker.slowCancel(maker, offerAssetId, offerAmount, wantAssetId, wantAmount,
                                   feeAssetId, feeAmount, nonce)
}

function constructTradeData(data) {
    const { addressMap, operator, user, offerAssetId, wantAssetId, feeAssetId,
            v, nonce, feeAmount, offerAmount, wantAmount } = data


    const userIndex = addressMap[user][offerAssetId]
    const dataA = bn(userIndex).or(shl(addressMap[user][offerAssetId], 8))
                               .or(shl(addressMap[user][wantAssetId], 16))
                               .or(shl(addressMap[user][feeAssetId], 24))
                               .or(shl(addressMap[operator][feeAssetId], 32))
                               .or(shl(v, 40))
                               .or(shl(nonce, 48))
                               .or(shl(feeAmount, 128))

    const dataB = bn(offerAmount).or(shl(wantAmount, 128))

    return { dataA, dataB }
}

function constructAddressMap({ offers, fills, operator }) {
    if (fills === undefined) { fills = [] }

    const addresses = []
    const addressPairs = []
    const addressMap = {}

    for (let i = 0; i < offers.length; i++) {
        const { maker, offerAssetId, wantAssetId, feeAssetId } = offers[i]
        addressPairs.push(
            { user: maker, assetId: offerAssetId },
            { user: maker, assetId: wantAssetId },
            { user: maker, assetId: feeAssetId },
            { user: operator, assetId: feeAssetId }
        )
    }

    for (let i = 0; i < fills.length; i++) {
        const { filler, offerAssetId, wantAssetId, feeAssetId } = fills[i]
        addressPairs.push(
            { user: filler, assetId: offerAssetId },
            { user: filler, assetId: wantAssetId },
            { user: filler, assetId: feeAssetId },
            { user: operator, assetId: feeAssetId }
        )
    }

    for (let i = 0; i < addressPairs.length; i++) {
        const { user, assetId } = addressPairs[i]
        if (addressMap[user] === undefined) { addressMap[user] = {} }
        if (addressMap[user][assetId] === undefined) {
            addresses.push(user, assetId)
            addressMap[user][assetId] = addresses.length / 2 - 1
        }
    }

    return { addresses, addressMap }
}

async function signOffer(offer, privateKey) {
    const { maker, offerAssetId, wantAssetId, feeAssetId,
            offerAmount, wantAmount, feeAmount, nonce } = offer

    return await signParameters(
        ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256',
         'address', 'uint256', 'uint256'],
        [TYPEHASHES.OFFER_TYPEHASH, maker, offerAssetId, offerAmount, wantAssetId, wantAmount,
         feeAssetId, feeAmount, nonce],
        privateKey
    )
}

async function signFill(fill, privateKey) {
    const { filler, offerAssetId, wantAssetId, feeAssetId,
            offerAmount, wantAmount, feeAmount, nonce } = fill

    return await signParameters(
        ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256',
         'address', 'uint256', 'uint256'],
        [TYPEHASHES.FILL_TYPEHASH, filler, offerAssetId, offerAmount, wantAssetId, wantAmount,
         feeAssetId, feeAmount, nonce],
        privateKey
    )
}

// `modify` is a callback to change the values sent to the contract,
// this is used to test validations
async function trade({ offers, fills, matches, operator }, { privateKeys }, modify) {
    const broker = await getBroker()
    const lengths = bn(offers.length).or(shl(fills.length, 8))
                                    .or(shl(matches.length, 16))
    const values = [lengths]
    const hashes = []
    const { addresses, addressMap } = constructAddressMap({ offers, fills, operator })

    for (let i = 0; i < offers.length; i++) {
        const offer = offers[i]
        const { v, r, s } = await signOffer(offer, privateKeys[offer.maker])
        const data = { ...offer, user: offer.maker, addressMap, operator, v }
        const { dataA, dataB } = constructTradeData(data)

        values.push(dataA, dataB)
        hashes.push(r, s)
    }

    for (let i = 0; i < fills.length; i++) {
        const fill = fills[i]
        const { v, r, s } = await signFill(fill, privateKeys[fill.filler])
        const data = { ...fill, user: fill.filler, addressMap, operator, v }
        const { dataA, dataB } = constructTradeData(data)

        values.push(dataA, dataB)
        hashes.push(r, s)
    }

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        const value = bn(match.offerIndex).or(shl(match.fillIndex, 8))
                                         .or(shl(match.takeAmount, 128))
        values.push(value)
    }

    // zero out operator addresses and asset IDs as these will overwritten by
    // the contract
    for (let i = 0; i < addresses.length; i += 2) {
        if (addresses[i] === operator) {
            addresses[i] = ZERO_ADDR
            addresses[i + 1] = ZERO_ADDR
        }
    }

    if (modify !== undefined) { modify({ values, hashes, addresses }) }

    return await broker.trade(values, hashes, addresses)
}

// `modify` is a callback to change the values sent to the contract,
// this is used to test validations
async function networkTrade({ offers, matches, operator }, { privateKeys }, modify) {
    const broker = await getBroker()
    const lengths = bn(offers.length).or(shl(matches.length, 16))
    const values = [lengths]
    const hashes = []
    const { addresses, addressMap } = constructAddressMap({ offers, operator })

    for (let i = 0; i < offers.length; i++) {
        const offer = offers[i]
        const { v, r, s } = await signOffer(offer, privateKeys[offer.maker])
        const data = { ...offer, user: offer.maker, addressMap, operator, v }
        const { dataA, dataB } = constructTradeData(data)

        values.push(dataA, dataB)
        hashes.push(r, s)
    }

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        const value = bn(match.offerIndex).or(shl(match.tradeProvider, 8))
                                          .or(shl(addressMap[operator][match.surplusAssetId], 16))
                                          .or(shl(match.data, 24))
                                          .or(shl(match.takeAmount, 128))
        values.push(value)
    }

    // zero out operator addresses and asset IDs as these will overwritten by
    // the contract
    for (let i = 0; i < addresses.length; i += 2) {
        if (addresses[i] === operator) {
            addresses[i] = ZERO_ADDR
            addresses[i + 1] = ZERO_ADDR
        }
    }

    if (modify !== undefined) { modify({ values, hashes, addresses }) }

    return await broker.networkTrade(values, hashes, addresses)
}

function hashSwap({ maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce }) {
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    return keccak256(encodeParameters(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'bytes32', 'uint256',
         'address', 'uint256', 'uint256'],
        [TYPEHASHES.SWAP_TYPEHASH, maker, taker, assetId, amount, hashedSecret, expiryTime,
         feeAssetId, feeAmount, nonce]
    ))
}

function hashOffer({ maker, offerAssetId, offerAmount, wantAssetId, wantAmount, feeAssetId, feeAmount, nonce }) {
    offerAssetId = ensureAddress(offerAssetId)
    wantAssetId = ensureAddress(wantAssetId)
    feeAssetId = ensureAddress(feeAssetId)
    return keccak256(encodeParameters(
        ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256',
         'address', 'uint256', 'uint256'],
        [TYPEHASHES.OFFER_TYPEHASH, maker, offerAssetId, offerAmount, wantAssetId, wantAmount,
         feeAssetId, feeAmount, nonce]
    ))
}

async function createSwap(
    {
        maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce
    },
    { privateKey }
)
{
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    const broker = await getBroker()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'bytes32', 'uint256',
         'address', 'uint256', 'uint256'],
        [TYPEHASHES.SWAP_TYPEHASH, maker, taker, assetId, amount, hashedSecret, expiryTime,
         feeAssetId, feeAmount, nonce],
        privateKey
    )
    const addresses = [maker, taker, assetId, feeAssetId]
    const values = [amount, expiryTime, feeAmount, nonce]
    const hashes = [hashedSecret, r, s]
    return await broker.createSwap(addresses, values, hashes, v, false)
}

async function executeSwap(
    {
        maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce, secret
    }
)
{
    assetId = ensureAddress(assetId)
    feeAssetId = ensureAddress(feeAssetId)
    const broker = await getBroker()
    const addresses = [maker, taker, assetId, feeAssetId]
    const values = [amount, expiryTime, feeAmount, nonce]
    return await broker.executeSwap(addresses, values, hashedSecret, web3.utils.utf8ToHex(secret))
}

async function cancelSwap(
    {
        maker, taker, assetId, amount, hashedSecret, expiryTime, feeAssetId, feeAmount, nonce, cancelFeeAmount
    }
)
{
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
    networkTrade,
    cancel,
    adminCancel,
    announceCancel,
    slowCancel,
    withdraw,
    createSwap,
    executeSwap,
    cancelSwap
}

module.exports = {
    web3,
    bn,
    shl,
    clone,
    getBroker,
    getJrc,
    getSwc,
    getDgtx,
    getZeus,
    getScratchpad,
    printLogs,
    hashSecret,
    validateBalance,
    validateExternalBalance,
    assertAsync,
    assertReversion,
    testValidation,
    getEvmTime,
    increaseEvmTime,
    decodeReceiptLogs,
    hashSwap,
    hashOffer,
    exchange
}
