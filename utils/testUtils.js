const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const ETHER_ADDR = '0x0000000000000000000000000000000000000000'
const OMG_ADDR = '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07'

const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')

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
    ReasonWithdrawFeeReceive: '15'
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

const assertEventEmission = (emittedEvents, expectedEvents) => {
    if (expectedEvents.length === 0) {
        throw new Error('expectedEvents is empty')
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
            assert.equal(actualArg.toString(), expectedArg, 'value for ' + key + ' is ' + expectedArg)
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

const getValidOfferParams = (nextNonce, maker, initialEtherBalance) => {
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
    assert.equal(balance.toString(), expectedBalance, message)
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

const createSwap = async (atomicBroker, { maker, taker, token, amount, hashedSecret, expiryTime, feeAsset, feeAmount }, txn, signature) => {
    if (signature === undefined) {
        signature = await signCreateSwap({ maker, offerAsset, wantAsset, offerAmount, wantAmount, feeAsset, feeAmount, nonce })
    }
    const { v, r, s } = signature
    await atomicBroker.createSwap.sendTransaction(maker, taker, token, amount, hashedSecret,
        expiryTime, feeAsset, feeAmount, v, r, s, txn)
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
    getValidOfferParams,
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
    createSwap
}
