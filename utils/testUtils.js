const sha256 = require('js-sha256').sha256

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const abiDecoder = require('abi-decoder')

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const ETHER_ADDR = '0x0000000000000000000000000000000000000000'
const OMG_ADDR = '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07'

const Broker = artifacts.require('Broker')
const AtomicBroker = artifacts.require('AtomicBroker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')

abiDecoder.addABI(Broker.abi)
abiDecoder.addABI(AtomicBroker.abi)

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
            assert.equal(actualArg.toString(), expectedArg, 'value for ' + key + ' is ' + expectedArg)
        }
    }
}

// assertEventEmission works for events from a single contract
// for
const assertReceiptLogs = (logs, expectedLogs) => {

}

const assertError = async (method, ...args) => {
  let error = null
  try {
    await method(...args)
  } catch (e) {
    error = e
  }
  assert.notEqual(error, null, "expected an error but none was caught")
  if (error.message.indexOf('VM Exception while processing transaction') !== 0) {
      console.log('error.message', error.message)
  }
  assert.equal(error.message.indexOf('VM Exception while processing transaction'), 0, 'Throws contract "require" error')
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
      offerAmount: initialEtherBalance.minus(1),
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

const makeOffer = async (broker, { maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce }, txn, signature) => {
    if (signature === undefined) {
        signature = await signMakeOffer({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    await broker.makeOffer.sendTransaction(maker, offerAsset, wantAsset,
        offerAmount, wantAmount, feeAsset, feeAmount, nonce, v, r, s, txn)
}

const fillOffer = async (broker, { filler, offerHash, amountToTake, feeAsset, feeAmount, nonce }, txn, signature) => {
    if (signature === undefined) {
        signature = await signFillOffer({ filler, offerHash, amountToTake, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    await broker.fillOffer.sendTransaction(filler, offerHash, amountToTake, feeAsset, feeAmount, nonce, v, r, s, txn)
}

const fillOffers = async (broker, { filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce }, txn, signature) => {
    if (signature === undefined) {
        signature = await signFillOffers({ filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    return await broker.fillOffers(filler, offerHashes, amountsToTake, feeAsset, feeAmount, nonce, v, r, s, txn)
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

const withdraw = async (broker, { withdrawer, token, amount, feeAsset, feeAmount, nonce }, txn, signature) => {
    if (signature === undefined) {
        signature = await signWithdraw({ withdrawer, token, amount, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    return broker.withdraw(withdrawer, token, amount, feeAsset, feeAmount, nonce, v, r, s, txn)
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
        await swCoin.mint.sendTransaction(user, swc)
        await swCoin.approve.sendTransaction(broker.address, swc, { from: user })
        await broker.depositERC20.sendTransaction(user, swCoin.address, swc, { from: coordinator })
    }
    if (jrc !== undefined) {
        jrCoin = await JRCoin.deployed()
        await jrCoin.mint.sendTransaction(user, jrc)
        await jrCoin.approve.sendTransaction(broker.address, jrc, { from: user })
        await broker.depositERC20.sendTransaction(user, jrCoin.address, jrc, { from: coordinator })
    }
    if (eth !== undefined) {
        await broker.depositEther.sendTransaction({ from: user, value: eth })
    }
}

const signCreateSwap = async ({ maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, signee) => {
    const message = web3.utils.soliditySha3(
        { type: 'string', value: 'createSwap' },
        { type: 'address', value: maker },
        { type: 'address', value: taker },
        { type: 'address', value: token },
        { type: 'uint256', value: amount },
        { type: 'bytes32', value: hashedSecret },
        { type: 'uint256', value: expiryTime },
        { type: 'address', value: feeAsset },
        { type: 'uint256', value: feeAmount }
    )
    if (signee === undefined) { signee = maker }
    const signature = await web3.eth.sign(message, signee)
    return getSignatureComponents(signature)
}

const createSwap = async (atomicBroker, { maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, txn, signee) => {
    if (signee === undefined) { signee = maker }
    const signature = await signCreateSwap({ maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, signee)
    const { v, r, s } = signature
    return await atomicBroker.createSwap(maker, taker, token, amount, hashedSecret,
        expiryTime, feeAsset, feeAmount, v, r, s, txn)
}

const fetchSwap = async (atomicBroker, hashedSecret) => {
    const swap = await atomicBroker.swaps.call(hashedSecret)
    return {
        maker: swap[0],
        taker: swap[1],
        token: swap[2],
        feeAsset: swap[3],
        amount: swap[4],
        expiryTime: swap[5],
        feeAmount: swap[6],
        active: swap[7]
    }
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

const getSampleSwapParams = ({ maker, taker, token, secret }) => {
    if (secret === undefined) {
        secret = '0x12'
    }
    const hashedSecret = web3.utils.soliditySha3({ type: 'bytes32', value: secret })

    return {
        maker,
        taker,
        token: token.address,
        amount: 999,
        secret,
        hashedSecret,
        expiryTime: parseInt(Date.now() / 1000.0 + 60),
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

const assertSwapParams = async (atomicBroker, { maker, taker, token, feeAsset, amount, expiryTime, feeAmount, active }, hashedSecret) => {
    const swap = await fetchSwap(atomicBroker, hashedSecret)
    assertAddress(swap.maker, maker)
    assertAddress(swap.taker, taker)
    assertAddress(swap.token, token)
    assertAddress(swap.feeAsset, feeAsset)
    assertAmount(swap.amount, amount)
    assertAmount(swap.expiryTime, expiryTime)
    assertAmount(swap.feeAmount, feeAmount)
    assert.equal(swap.active, active)
}

const assertSwapDoesNotExist = async (atomicBroker, hashedSecret) => {
    await assertSwapParams(atomicBroker, emptySwapParams, hashedSecret)
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
    fillOffer,
    signFillOffers,
    fillOffers,
    signWithdraw,
    withdraw,
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
    fetchSwap,
    getSampleSwapParams,
    assertAddress,
    assertAmount,
    assertSwapParams,
    assertSwapDoesNotExist
}
