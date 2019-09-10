const Utils = artifacts.require('Utils')
const BrokerV2 = artifacts.require('BrokerV2')
const ERC777 = artifacts.require('ERC777')
const TokenList = artifacts.require('TokenList')
const SpenderList = artifacts.require('SpenderList')
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
abiDecoder.addABI(Utils.abi)
abiDecoder.addABI(BrokerV2.abi)
abiDecoder.addABI(DGTXCoin.abi)
abiDecoder.addABI(ERC777.abi)
abiDecoder.addABI(SpenderList.abi)

const { DOMAIN_SEPARATOR, TYPEHASHES, ZERO_ADDR,
        ONE_ADDR, ETHER_ADDR } = require('../constants')

async function getBroker() { return await BrokerV2.deployed() }
async function getTokenList() { return await TokenList.deployed() }
async function getSpenderList() { return await SpenderList.deployed() }
async function getJrc() { return await JRCoin.deployed() }
async function getSwc() { return await SWCoin.deployed() }
async function getDgtx() { return await DGTXCoin.deployed() }
async function getZeus(account) {
    /* eslint-disable new-cap */
    await singletons.ERC1820Registry(account)
    return await ZEUSCoin.new()
}

function bn(value, base) { return new BN(value, base) }
function shl(value, n) { return bn(value).shln(n) }

function getSubBits(value, start, end) {
    const str = bn(value).toString(2, 256)
                         .substring(256 - end, 256 - start)

    return bn(str, 2)
}

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
        if (errorMessage !== undefined) {
            const messageFound = error.message.search(errorMessage) >= 0
            assert(messageFound, `Expected "${errorMessage}", got ${error} instead`)
        } else {
            const revertFound = error.message.search('revert') >= 0
            assert(revertFound, `Expected "revert", got ${error} instead`)
        }
        return
    }
    assert.fail('Expected an EVM revert but no error was encountered')
}

async function testOnlyOwnerModifier(method, { params, owner, nonOwner }) {
    await testValidation(method, 'Ownable: caller is not the owner', {
        params,
        fail: { from: nonOwner },
        pass: { from: owner }
    })
}

async function testValidation(method, errorMessage, { params, fail, pass }) {
    if (!Array.isArray(fail)) { fail = [fail] }
    if (!Array.isArray(pass)) { pass = [pass] }
    await assertReversion(method(...[...params, ...fail]), errorMessage)
    await method(...[...params, ...pass])
}

function hashSecret(secret) {
    return '0x' + sha256(web3.utils.hexToBytes('0x' + sha256(secret)))
}

async function parseInvocation(result) {
    const transaction = await web3.eth.getTransaction(result.receipt.transactionHash)
    return abiDecoder.decodeMethod(transaction.input)
}

function parseLogs(receiptLogs) {
    const logs = abiDecoder.decodeLogs(receiptLogs)
    const decodedLogs = []
    for (const log of logs) {
        const decodedLog = { name: log.name, args: {} }
        for (const event of log.events) {
            decodedLog.args[event.name] = event.value
        }
        decodedLogs.push(decodedLog)
    }
    return decodedLogs
}

async function reconstructTradeAddresses(values, addresses) {
    const broker = await getBroker()
    const operator = await broker.operator()

    // set the operator address as it was previously overwritten as address(0)
    for (let i = 0; i < addresses.length / 2; i++) {
        if (addresses[i * 2] === ZERO_ADDR) { addresses[i * 2] = operator }
    }

    const lengths = values[0]
    const numOffers = getSubBits(lengths, 0, 8).toNumber()
    const numFills = getSubBits(lengths, 8, 16).toNumber()

    // set the operate fee asset ID as it was previously overwritten as address(1)
    for (let i = 0; i < numOffers + numFills; i++) {
        const data = values[1 + i * 2]
        const feeAssetIndexA = getSubBits(data, 24, 32)
        const feeAssetIndexB = getSubBits(data, 32, 40)
        addresses[feeAssetIndexB * 2 + 1] = addresses[feeAssetIndexA * 2 + 1]
    }
}

async function parseTradeEvents(result) {
    const invocation = await parseInvocation(result)
    const nonces = []
    const values = invocation.params[0].value
    const addresses = invocation.params[2].value
    await reconstructTradeAddresses(values, addresses)
    const lengths = values[0]
    const numOffers = getSubBits(lengths, 0, 8).toNumber()
    const numFills = getSubBits(lengths, 8, 16).toNumber()

    for (let i = 0; i < numOffers + numFills; i++) {
        const data = values[1 + i * 2]
        const nonce = getSubBits(data, 56, 128)
        nonces.push(nonce.toString())
    }

    let logs
    if (result.receipt.logs) { logs = result.receipt.logs }
    if (result.receipt.rawLogs) { logs = result.receipt.rawLogs }
    logs = parseLogs(logs)

    const balanceChanges = []
    const dynamicIncrements = []

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        if (['Increment', 'Decrement'].includes(log.name)) {
            const { data } = log.args
            const index = getSubBits(data, 248, 256).toNumber()
            const dynamic = getSubBits(data, 240, 248).toString() === '0'
            const amount = getSubBits(data, 0, 240)
            const user = addresses[index * 2]
            const assetId = addresses[index * 2 + 1]

            if (log.name === 'Increment' && dynamic) {
                const str = [user, assetId, amount.toString()].join(',')
                dynamicIncrements.push(str)
                continue
            }

            balanceChanges.push({
                type: log.name,
                user,
                assetId,
                amount,
                dynamic
            })
        }
    }

    const balanceMap = {}

    for (let i = 0; i < balanceChanges.length; i++) {
        const { type, user, assetId, amount } = balanceChanges[i]
        if (balanceMap[user] === undefined) { balanceMap[user] = {} }
        if (balanceMap[user][assetId] === undefined) {
            balanceMap[user][assetId] = { type, amount: bn(0) }
        }

        if (type === balanceMap[user][assetId].type) {
            balanceMap[user][assetId].amount = balanceMap[user][assetId].amount.add(amount)
            continue
        }

        if (balanceMap[user][assetId].amount.gte(amount)) {
            balanceMap[user][assetId].amount = balanceMap[user][assetId].amount.sub(amount)
            continue
        }

        // flip the type
        balanceMap[user][assetId].type = type
        balanceMap[user][assetId].amount = amount.sub(balanceMap[user][assetId].amount)
    }

    const increments = []
    const decrements = []
    for (const user in balanceMap) {
        for (const assetId in balanceMap[user]) {
            const { type, amount } = balanceMap[user][assetId]
            const str = [user, assetId, amount.toString()].join(',')
            if (type === 'Increment') {
                increments.push(str)
            } else {
                decrements.push(str)
            }
        }
    }

    return { nonces, increments, decrements, dynamicIncrements }
}

function constructTradeEventsKey(logs) {
    const { nonces, increments, decrements } = logs

    const str = [
        'nonces',
        '[',
        nonces.map((nonce) => nonce.toString()).sort().join(','),
        '],',
        'increments',
        '[',
        increments.map((str) => str.toLowerCase()).sort().join(','),
        '],',
        'decrements',
        '[',
        decrements.map((str) => str.toLowerCase()).sort().join(','),
        ']'
    ].join('')

    return sha256(str)
}

async function testTradeEvents(result, logsB) {
    const logsA = await parseTradeEvents(result)
    const keyA = constructTradeEventsKey(logsA)
    const keyB = constructTradeEventsKey(logsB)

    assert.equal(keyA, keyB, 'Trade events mismatch')

    const dynamicIncrementsA = logsA.dynamicIncrements
                                    .map((str) => str.toLowerCase())
                                    .sort()
                                    .join(',')

    const dynamicIncrementsB = logsA.dynamicIncrements
                                    .map((str) => str.toLowerCase())
                                    .sort()
                                    .join(',')

    assert.equal(dynamicIncrementsA, dynamicIncrementsB, 'Dynamic increments mismatch')
}

function testEvents(result, logsB, { start, end } = {}) {
    let logsA
    if (result.receipt.logs) { logsA = result.receipt.logs }
    if (result.receipt.rawLogs) { logsA = result.receipt.rawLogs }
    logsA = parseLogs(logsA)
    // console.log('logsA', logsA)
    // return

    if (logsB.length === 0) {
        throw new Error('logsB is empty')
    }

    if (start !== undefined && end !== undefined) {
        logsA = logsA.slice(start, end)
    }

    assert.equal(
        logsA.length * 2,
        logsB.length,
        'log length mismatch'
    )

    for (let i = 0; i < logsA.length; i++) {
        const logA = logsA[i]
        const logB = {
            name: logsB[i * 2],
            args: logsB[i * 2 + 1]
        }

        assert.equal(
            logA.name,
            logB.name,
            'event type is ' + logB.name
        )

        const argsB = logB.args
        if (Object.keys(argsB).length === 0) {
            throw new Error('argsB is empty')
        }

        for (const key in argsB) {
            const argA = logA.args[key]
            const argB = argsB[key]
            if (argA === undefined) {
                throw new Error('value for ' + argB.name + '.' + key + ' is undefined')
            }

            if (argA === null) {
                assert.equal(
                    argA,
                    argB,
                    'value for ' + key + ' is: ' + argA + ', expected: ' + argB
                )
            } else {
                assert.equal(
                    argA.toString().toLowerCase(),
                    argB.toString().toLowerCase(),
                    'value for ' + key + ' is :' + argA + ', expected: ' + argB
                )
            }
        }
    }
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
    const spenderList = await getSpenderList()
    const { v, r, s } = await signParameters(
        ['bytes32', 'address', 'address', 'uint256'],
        [TYPEHASHES.AUTHORIZE_SPENDER_TYPEHASH, user, spender, nonce],
        privateKey
    )
    return await spenderList.authorizeSpender(user, spender, nonce, v, r, s, false)
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
                               .or(shl(nonce, 56))
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
            addresses[i + 1] = ONE_ADDR
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
        const value = bn(match.offerIndex).or(shl(match.marketDapp, 8))
                                          .or(shl(addressMap[operator][match.surplusAssetId], 16))
                                          .or(shl(match.data, 24))
                                          .or(shl(match.takeAmount, 128))
        values.push(value)
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
    getTokenList,
    getSpenderList,
    getJrc,
    getSwc,
    getDgtx,
    getZeus,
    printLogs,
    hashSecret,
    validateBalance,
    validateExternalBalance,
    assertAsync,
    assertReversion,
    testEvents,
    testTradeEvents,
    testValidation,
    testOnlyOwnerModifier,
    getEvmTime,
    increaseEvmTime,
    parseLogs,
    hashSwap,
    hashOffer,
    exchange
}
