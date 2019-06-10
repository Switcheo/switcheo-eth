const sha256 = require('js-sha256').sha256

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const abiDecoder = require('abi-decoder')
const { BigNumber } = require('bignumber.js')

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const ETHER_ADDR = '0x0000000000000000000000000000000000000000'
const OMG_ADDR = '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07'

const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')
const AirDropper = artifacts.require('AirDropper')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')

abiDecoder.addABI(Broker.abi)
abiDecoder.addABI(AtomicBroker.abi)
abiDecoder.addABI(AirDropper.abi)

const HEX_REASONS = {
    ReasonDeposit: '01',

    ReasonMakerGive: '02',
    ReasonMakerFeeGive: '10',
    ReasonMakerFeeReceive: '11',

    ReasonFillerGive: '03',
    ReasonFillerFeeGive: '04',
    ReasonFillerReceive: '05',
    ReasonMakerReceive: '06',
    ReasonFillerFeeReceive: '07',

    ReasonCancel: '08',
    ReasonCancelFeeGive: '12',
    ReasonCancelFeeReceive: '13',

    ReasonWithdraw: '09',
    ReasonWithdrawFeeGive: '14',
    ReasonWithdrawFeeReceive: '15',

    ReasonSwapMakerGive: '30',
    ReasonSwapHolderReceive: '31',
    ReasonSwapMakerFeeGive: '32',
    ReasonSwapHolderFeeReceive: '33',

    ReasonSwapHolderGive: '34',
    ReasonSwapTakerReceive: '35',
    ReasonSwapFeeGive: '36',
    ReasonSwapFeeReceive: '37',

    ReasonSwapCancelMakerReceive: '38',
    ReasonSwapCancelHolderGive: '39',
    ReasonSwapCancelFeeGive: '3A',
    ReasonSwapCancelFeeReceive: '3B',
    ReasonSwapCancelFeeRefundGive: '3C',
    ReasonSwapCancelFeeRefundReceive: '3D'
}

const REASON = {}
const uniqueReasonNumberCheck = {}

for (const key in HEX_REASONS) {
    const reasonNumber = parseInt(HEX_REASONS[key], 16)
    REASON[key] = reasonNumber
    if (uniqueReasonNumberCheck[reasonNumber]) {
        throw new Error('Reason numbers are not unique')
    }
    uniqueReasonNumberCheck[reasonNumber] = true
}

const nonceGenerator = function*() {
    let n = 0
    while (true) {
        yield n++
    }
}

const decodeReceiptLogs = (receiptLogs) => {
    const logs = abiDecoder.decodeLogs(receiptLogs)
    const decodedLogs = []
    for (const log of logs) {
        const decodedLog = {
            event: log.name,
            args: {}
        }
        for (const event of log.events) {
            decodedLog.args[event.name] = event.value
        }
        decodedLogs.push(decodedLog)
    }
    return decodedLogs
}

const assertEventEmission = (emittedEvents, expectedEvents) => {
    if (expectedEvents.length === 0) {
        throw new Error('expectedEvents is empty')
    }
    // decode the events if they are raw logs from the transaction receipt
    if (emittedEvents[0].event === undefined) {
        emittedEvents = decodeReceiptLogs(emittedEvents)
    }
    assert.equal(emittedEvents.length, expectedEvents.length, 'some events are not being tested')
    for (let i = 0; i < emittedEvents.length; i++) {
        const emittedEvent = emittedEvents[i]
        const expectedEvent = expectedEvents[i]
        const expectedEventType = expectedEvent.eventType
        const expectedArgs = expectedEvent.args

        assert.equal(emittedEvent.event, expectedEventType, 'event type is ' + expectedEventType)
        if (Object.keys(expectedArgs).length === 0) { throw new Error('expectedArgs is empty') }
        for (const key in expectedArgs) {
            const actualArg = emittedEvent.args[key]
            const expectedArg = expectedArgs[key]
            if (actualArg === undefined) { throw new Error('value for ' + key + ' is undefined') }
            assert.equal(actualArg.toString().toLowerCase(), expectedArg.toString().toLowerCase(),
              'value for ' + key + ' is ' + expectedArg)
        }
    }
}

const assertError = async (method, ...args) => {
  let error = null
  try {
    await method(...args)
  } catch (e) {
    error = e
  }
  assert.notEqual(error, null, "expected an error but none was caught")
  if (error.message.indexOf('Returned error: VM Exception while processing transaction') < 0) {
      console.log('Found error with wrong message:', error.message)
  }
  assert.equal(error.message.indexOf('Returned error: VM Exception while processing transaction'), 0, 'Expected revert but none was thrown')
}

const assertRevert = async (promise) => {
    try {
        await promise;
    } catch (error) {
        const revertFound = error.message.search('revert') >= 0;
        assert(revertFound, `Expected "revert", got ${error} instead`);
        return;
    }
    assert.fail('Expected revert not received');
}

const getOfferHash = ({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce }) => {
    const offerHash = web3.utils.soliditySha3(
        { type: 'string', value: 'makeOffer' },
        { type: 'address', value: maker },
        { type: 'address', value: offerAsset },
        { type: 'address', value: wantAsset },
        { type: 'uint256', value: offerAmount },
        { type: 'uint256', value: wantAmount },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount },
        { type: 'uint64', value: nonce }
    )
    return offerHash
}

const getSignatureComponents = (signature) => {
    const sig = signature.slice(2)
    const v = web3.utils.toDecimal(sig.slice(128, 130)) + 27
    const r = `0x${sig.slice(0, 64)}`
    const s = `0x${sig.slice(64, 128)}`
    return { v, r, s }
}

const signMakeOffer = async ({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce }, signee) => {
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'makeOffer' },
        { type: 'address', value: maker },
        { type: 'address', value: offerAsset },
        { type: 'address', value: wantAsset },
        { type: 'uint256', value: offerAmount },
        { type: 'uint256', value: wantAmount },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount },
        { type: 'uint64', value: nonce }
    )
    if (signee === undefined) { signee = maker }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const signCancel = async ({ offerParams, feeAsset, feeAmount }, signee) => {
    const offerHash = getOfferHash(offerParams)
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'cancel' },
        { type: 'bytes', value: offerHash },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount }
    )
    if (signee === undefined) { signee = offerParams.maker }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const signFillOffer = async ({ filler, offerHash, amountToTake, feeAsset, feeAmount, nonce }, signee) => {
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'fillOffer' },
        { type: 'address', value: filler },
        { type: 'bytes', value: offerHash },
        { type: 'uint256', value: amountToTake },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount },
        { type: 'uint64', value: nonce }
    )
    if (signee === undefined) { signee = filler }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const signFillOffers = async ({ filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce }, signee) => {
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'fillOffers' },
        { type: 'address', value: filler },
        { type: 'bytes32[]', value: offerHashes },
        { type: 'uint256[]', value: amountsToTake },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount },
        { type: 'uint64', value: nonce }
    )
    if (signee === undefined) { signee = filler }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const emptyOfferParams = {
    maker: ZERO_ADDR,
    offerAsset: ZERO_ADDR,
    wantAsset: ZERO_ADDR,
    offerAmount: 0,
    wantAmount: 0,
    nonce: 0
}

const getSampleOfferParams = (nextNonce, maker, initialEtherBalance) => {
  const nonce = nextNonce()

  return {
      maker,
      offerAsset: ETHER_ADDR,
      wantAsset: OMG_ADDR,
      offerAmount: new BigNumber(initialEtherBalance).minus(1).toString(),
      wantAmount: 20,
      feeAsset: ETHER_ADDR,
      feeAmount: 0,
      nonce
  }
}

const fetchOffer = async (broker, offerHash) => {
    const offer = await broker.offers.call(offerHash)
    return {
        maker: offer[0],
        offerAsset: offer[1],
        wantAsset: offer[2],
        nonce: offer[3],
        offerAmount: offer[4],
        wantAmount: offer[5],
        availableAmount: offer[6]
    }
}

const makeOffer = async (broker, { maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce }, signature) => {
    if (signature === undefined) {
        signature = await signMakeOffer({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    await broker.makeOffer(maker, offerAsset, wantAsset,
        offerAmount, wantAmount, feeAsset, feeAmount, nonce, v, r, s)
}

const makeOfferFrom = async (broker, { maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce }, from) => {
    const { v, r, s } = await signMakeOffer({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce })
    await broker.makeOffer(maker, offerAsset, wantAsset,
        offerAmount, wantAmount, feeAsset, feeAmount, nonce, v, r, s, { from })
}

const fillOffer = async (broker, { filler, offerHash, amountToTake, feeAsset, feeAmount, nonce }, signature) => {
    if (signature === undefined) {
        signature = await signFillOffer({ filler, offerHash, amountToTake, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    await broker.fillOffer(filler, offerHash, amountToTake, feeAsset, feeAmount, nonce, v, r, s)
}

const fillOfferFrom = async (broker, { filler, offerHash, amountToTake, feeAsset, feeAmount, nonce }, from) => {
    const { v, r, s } = await signFillOffer({ filler, offerHash, amountToTake, feeAsset, feeAmount, nonce })
    await broker.fillOffer(filler, offerHash, amountToTake, feeAsset, feeAmount, nonce, v, r, s, { from })
}

const fillOffers = async (broker, { filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce }, signature) => {
    if (signature === undefined) {
        signature = await signFillOffers({ filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    return await broker.fillOffers(filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce, v, r, s)
}

const signWithdraw = async ({ withdrawer, token, amount, feeAsset, feeAmount, nonce }, signee) => {
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'withdraw' },
        { type: 'address', value: withdrawer },
        { type: 'address', value: token },
        { type: 'uint256', value: amount },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount },
        { type: 'uint64', value: nonce }
    )
    if (signee === undefined) { signee = withdrawer }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const withdraw = async (broker, { withdrawer, token, amount, feeAsset, feeAmount, nonce }, signature) => {
    if (signature === undefined) {
        signature = await signWithdraw({ withdrawer, token, amount, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    return broker.withdraw(withdrawer, token, amount, feeAsset, feeAmount, nonce, v, r, s)
}

const withdrawFrom= async (broker, { withdrawer, token, amount, feeAsset, feeAmount, nonce }, from) => {
    const { v, r, s } = await signWithdraw({ withdrawer, token, amount, feeAsset, feeAmount, nonce })
    return broker.withdraw(withdrawer, token, amount, feeAsset, feeAmount, nonce, v, r, s, { from })
}


const assertOfferParams = async (broker, { maker, offerAsset, wantAsset, offerAmount, wantAmount, availableAmount, feeAsset, feeAmount, nonce }, offerHash) => {
    if (offerHash === undefined) { offerHash = getOfferHash({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce }) }

    const offer = await broker.offers.call(offerHash)

    assert.equal(offer[0].toLowerCase(), maker.toLowerCase())
    assert.equal(offer[1].toLowerCase(), offerAsset.toLowerCase())
    assert.equal(offer[2].toLowerCase(), wantAsset.toLowerCase())
    assert.equal(offer[3].toString(), nonce.toString())
    assert.equal(offer[4].toString(), offerAmount.toString())
    assert.equal(offer[5].toString(), wantAmount.toString())
    if (availableAmount === undefined) { availableAmount = offerAmount }
    assert.equal(offer[6].toString(), availableAmount.toString())
}

const assertOfferDoesNotExist = async (broker, offerParams) => {
    const offerHash = getOfferHash(offerParams)
    const offer = await broker.offers.call(offerHash)
    await assertOfferParams(broker, emptyOfferParams, offerHash)
}

const assertTokenBalance = async (broker, user, tokenAddress, expectedBalance, message) => {
    const balance = await broker.balances.call(user, tokenAddress)
    assert.equal(balance.toString(), expectedBalance.toString(), message)
}

const assertEtherBalance = async (broker, user, expectedBalance, message) => {
    await assertTokenBalance(broker, user, ETHER_ADDR, expectedBalance, message)
}

const assertWalletEtherAmount = async (user, expectedAmount, message) => {
    const amount = await web3.eth.getBalance(user)
    assert.equal(amount.toString(), expectedAmount, message)
}

const assertWalletTokenAmount = async (token, user, expectedAmount, message) => {
    const amount = await token.balanceOf.call(user)
    assert.equal(amount.toString(), expectedAmount, message)
}

const fundUser = async ({ broker, user, coordinator }, { eth, jrc, swc }) => {
    if (swc !== undefined) {
        swCoin = await SWCoin.deployed()
        await swCoin.mint(user, swc)
        await swCoin.approve(broker.address, swc, { from: user })
        await broker.depositERC20(user, swCoin.address, swc, { from: coordinator })
    }
    if (jrc !== undefined) {
        jrCoin = await JRCoin.deployed()
        await jrCoin.mint(user, jrc)
        await jrCoin.approve(broker.address, jrc, { from: user })
        await broker.depositERC20(user, jrCoin.address, jrc, { from: coordinator })
    }
    if (eth !== undefined) {
        await broker.depositEther({ from: user, value: eth })
    }
}

const hashSwapParams = ({ maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }) => {
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'swap' },
        { type: 'address', value: maker },
        { type: 'address', value: taker },
        { type: 'address', value: token },
        { type: 'uint256', value: amount },
        { type: 'bytes32', value: hashedSecret },
        { type: 'uint256', value: expiryTime },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount }
    )
    return message
}

const signCreateSwap = async ({ maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, signee) => {
    const message = hashSwapParams({ maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount })
    if (signee === undefined) { signee = maker }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const createSwap = async (atomicBroker, { maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, signee) => {
    if (signee === undefined) { signee = maker }
    const signature = await signCreateSwap({ maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, signee)
    const { v, r, s } = signature
    return await atomicBroker.createSwap(maker, taker, token, amount, hashedSecret,
        expiryTime, feeAsset, feeAmount, v, r, s)
}

const executeSwap = async (atomicBroker, { maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount, secret }) => {
    return await atomicBroker.executeSwap(maker, taker, token, amount, hashedSecret,
        expiryTime, feeAsset, feeAmount, secret)
}

const cancelSwap = async (atomicBroker, { maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount, cancelFeeAmount }) => {
    return await atomicBroker.cancelSwap(maker, taker, token, amount, hashedSecret,
        expiryTime, feeAsset, feeAmount, cancelFeeAmount)
}

const cancelSwapFrom = async (atomicBroker, { maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount, cancelFeeAmount }, from) => {
  return await atomicBroker.cancelSwap(maker, taker, token, amount, hashedSecret,
      expiryTime, feeAsset, feeAmount, cancelFeeAmount, { from })
}

const fetchSwapExistance = async (atomicBroker, swapParams) => {
    const swapHash = hashSwapParams(swapParams)
    return await atomicBroker.swaps.call(swapHash)
}

const emptySwapParams = {
    maker: ZERO_ADDR,
    taker: ZERO_ADDR,
    token: ZERO_ADDR,
    amount: 0,
    expiryTime: 0,
    feeAsset: ZERO_ADDR,
    feeAmount: 0,
    active: false
}

const assertBalances = async (broker, userBalances) => {
    const jrCoin = await JRCoin.deployed()
    const swCoin = await SWCoin.deployed()
    for (const user in userBalances) {
        const assets = userBalances[user]
        for (const asset in assets) {
            const expectedAmount = assets[asset]
            let assetAddress
            if (asset === 'jrc') { assetAddress = jrCoin.address }
            else if (asset === 'swc') { assetAddress = swCoin.address }
            else { throw new Error('Unrecognized asset') }
            const message = `expected ${expectedAmount} ${asset} for ${user}`
            await assertTokenBalance(broker, user, assetAddress, expectedAmount, message)
        }
    }
}

const hashSecret = (secret) => '0x' + sha256(web3.utils.hexToBytes('0x' + sha256(secret)))

const getSampleSwapParams = async ({ maker, taker, token, secret }) => {
    if (secret === undefined) {
        secret = 'password123'
    }
    const hashedSecret = hashSecret(secret)
    const evmTime = await getEvmTime()

    const expiryDelay = 600
    return {
        maker,
        taker,
        token: token.address,
        amount: 999,
        secret: web3.utils.utf8ToHex(secret),
        hashedSecret,
        expiryTime: evmTime + expiryDelay,
        expiryDelay,
        feeAsset: token.address,
        feeAmount: 1,
        active: true
    }
}

const assertAddress = (value, expected) => {
    assert.equal(value.toLowerCase(), expected.toLowerCase())
}

const assertAmount = (value, expected) => {
    assert.equal(value.toString(), expected.toString())
}

const assertSwapExists = async (atomicBroker, swapParams) => {
    const swapExists = await fetchSwapExistance(atomicBroker, swapParams)
    assert.equal(swapExists, true)
}

const assertSwapDoesNotExist = async (atomicBroker, swapParams) => {
    const swapExists = await fetchSwapExistance(atomicBroker, swapParams)
    assert.equal(swapExists, false)
}

const increaseEvmTime = async (time) => {
  await web3.currentProvider.send('evm_increaseTime', [time])
  await web3.currentProvider.send('evm_mine', [])
}

const getEvmTime = async () => {
    const blockNumber = await web3.eth.getBlockNumber()
    const block = await web3.eth.getBlock(blockNumber)
    return block.timestamp
}

module.exports = {
    ZERO_ADDR,
    ETHER_ADDR,
    OMG_ADDR,
    REASON,
    nonceGenerator,
    assertError,
    assertRevert,
    getOfferHash,
    fetchOffer,
    getSignatureComponents,
    signMakeOffer,
    signCancel,
    signFillOffer,
    emptyOfferParams,
    getSampleOfferParams,
    makeOffer,
    makeOfferFrom,
    fillOffer,
    fillOfferFrom,
    signFillOffers,
    fillOffers,
    signWithdraw,
    withdraw,
    withdrawFrom,
    assertOfferDoesNotExist,
    assertOfferParams,
    assertTokenBalance,
    assertEtherBalance,
    assertEventEmission,
    assertWalletEtherAmount,
    assertWalletTokenAmount,
    fundUser,
    signCreateSwap,
    createSwap,
    executeSwap,
    cancelSwap,
    cancelSwapFrom,
    fetchSwapExistance,
    hashSecret,
    getSampleSwapParams,
    assertAddress,
    assertAmount,
    assertSwapExists,
    assertSwapDoesNotExist,
    assertBalances,
    increaseEvmTime,
    getEvmTime
}
