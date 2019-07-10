const MerkleBroker = artifacts.require('MerkleBroker')

const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

async function printBalances (merkleBroker, users, assets) {
    for (let i = 0; i < Object.keys(users).length; i++) {
        const userLabel = Object.keys(users)[i]
        const user = users[userLabel]

        for (let j = 0; j < Object.keys(assets).length; j++) {
            const assetLabel = Object.keys(assets)[j]
            const asset = assets[assetLabel]

            const balance = await merkleBroker.balances(user, asset)
            console.log(userLabel + ' ' + assetLabel + ': ' + balance)
        }
    }
    console.log('-------------')
}

async function getSignatureComponents (message, signee) {
    const signature = await web3.eth.sign(message, signee)
    const sig = signature.slice(2)
    const v = web3.utils.toDecimal(sig.slice(128, 130)) + 27
    const r = `0x${sig.slice(0, 64)}`
    const s = `0x${sig.slice(64, 128)}`
    return { v, r, s }
}

function getOfferHash({ addresses, values }) {
    const offerHash = web3.utils.soliditySha3(
        { type: 'string', value: 'makeOffer' },
        { type: 'address', value: addresses[0] },
        { type: 'address', value: addresses[2] },
        { type: 'address', value: addresses[3] },
        { type: 'uint256', value: values[0] },
        { type: 'uint256', value: values[1] },
        { type: 'uint256', value: values[4] }
    )
    return offerHash
}

function getFillHash({ offerHash, addresses, values }) {
    const fillHash = web3.utils.soliditySha3(
        { type: 'string', value: 'fillOffer' },
        { type: 'address', value: addresses[1] },
        { type: 'bytes32', value: offerHash },
        { type: 'uint256', value: values[2] },
        { type: 'address', value: addresses[4] },
        { type: 'uint256', value: values[3] },
        { type: 'uint256', value: values[5] }
    )
    return fillHash
}

async function getTradeSignatures({ addresses, values }) {
    const offerHash = getOfferHash({ addresses, values })
    const fillHash = getFillHash({ offerHash, addresses, values })

    const offerSig = await getSignatureComponents(offerHash, addresses[0])
    const fillSig = await getSignatureComponents(fillHash, addresses[1])
    const v = [offerSig.v, fillSig.v]
    const r = [offerSig.r, fillSig.r]
    const s = [offerSig.s, fillSig.s]

    return { v, r, s }
}

async function trade (merkleBroker, { users, assets, amounts, nonces }) {
    const { v, r, s } = await getTradeSignatures({ users, assets, amounts, nonces })
    const result = await merkleBroker.trade(users, assets, amounts, nonces, v, r, s)
    return result
}

async function batchTrade (merkleBroker, { addresses, values }) {
    let v = [], r = [], s = []

    for (let i = 0; i < addresses.length / 5; i++) {
        const sig = await getTradeSignatures({
            addresses: addresses.slice(i * 5, i * 5 + 5),
            values: values.slice(i * 6, i * 6 + 6)
        })
        v = v.concat(sig.v)
        r = r.concat(sig.r)
        s = s.concat(sig.s)
    }

    return await merkleBroker.batchTrade(addresses, values, v, r, s)
}


contract('Example', async (accounts) => {
    let merkleBroker
    const t1 = '0xb1ccdb544f603af631525ec406245909ad6e1b60'
    const t2 = '0x931d387731bbbc988b312206c74f77d004d6b84b'
    const coordinator = accounts[0]
    const maker = accounts[1]
    const taker = accounts[2]
    const userMap = { maker, taker, coordinator }
    const assetMap = { t1, t2 }

    beforeEach(async () => {
        merkleBroker = await MerkleBroker.deployed()
    })

    // contract('trade', async () => {
    //     it('performs a trade', async () => {
    //         await merkleBroker.deposit(maker, t1, 100) // 46005 for gas use
    //         await merkleBroker.deposit(taker, t2, 10)
    //         await merkleBroker.deposit(coordinator, t1, 1)
    //         await printBalances(merkleBroker, userMap, assetMap)
    //
    //         const users = [maker, taker]
    //         const assets = [t1, t2, t1]
    //         const amounts = [100, 50, 10, 2]
    //         const nonces = [67, 89]
    //
    //         await merkleBroker.markNonce(0)
    //
    //         // 187178 gas: upper limit
    //         // 172152 gas: if coordinator already has fee asset
    //         //
    //         // 144038 gas: with used nonces optimization
    //         // 114038 gas: if maker already has offer.wantAsset and taker already has offer.offerAsset
    //         // 91178 gas: if there are no balance changes
    //         // 80368 gas: if there is no nonce storage
    //         //
    //         // 22860 gas to 52860 gas: balance storage costs
    //         // 52860 gas: 2 * 20000 + 3 * 5000 (2 new balances and 3 balance changes, can be 4 balance changes if fill.feeAsset != offer.offerAsset)
    //         // 10810 gas: nonce storage cost
    //         // 43082 gas: base gas cost
    //         // 80368 - 43082 = 37286 gas: computation costs
    //         //
    //         // If we can process 4 trades, cost per trade would be 43082 * 3/4 = ~30,000 gas cheaper
    //         // 84670: without balance storage optimization and with computation optimization
    //         const result = await trade(merkleBroker, { users, assets, amounts, nonces })
    //         await printBalances(merkleBroker, userMap, assetMap)
    //         console.log('gas used', result.receipt.gasUsed)
    //
    //         // calling the function with an empty body costs 43082
    //     })
    // })

    contract('batchTrade', async () => {
        it('performs multiple trades', async () => {
            await merkleBroker.deposit(maker, t1, 1000) // 46005 gas used
            await merkleBroker.deposit(taker, t2, 100)
            await merkleBroker.deposit(coordinator, t1, 1)
            await printBalances(merkleBroker, userMap, assetMap)

            // const addresses = [maker, taker, t1, t2, t1]
            // const values = [100, 50, 10, 2, 71, 72]

            // const addresses = [maker, taker, t1, t2, t1, maker, taker, t1, t2, t1]
            // const values = [100, 50, 10, 2, 71, 72, 100, 50, 10, 2, 73, 74]

            // const addresses = [maker, taker, t1, t2, t1, maker, taker, t1, t2, t1, maker, taker, t1, t2, t1]
            // const values = [100, 50, 10, 2, 71, 72, 100, 50, 10, 2, 73, 74, 100, 50, 10, 2, 75, 76]

            const addresses = [maker, taker, t1, t2, t1, maker, taker, t1, t2, t1, maker, taker, t1, t2, t1, maker, taker, t1, t2, t1]
            const values = [100, 50, 10, 2, 71, 72, 100, 50, 10, 2, 73, 74, 100, 50, 10, 2, 75, 76, 100, 50, 10, 2, 77, 78]

            await merkleBroker.markNonce(0)

            // gas used for 1 trade: 157538
            // gas used for 2 trades: 260423 / 2 = 130211
            // gas used for 3 trades: 363255 / 3 = 121085
            // gas used for 4 trades: 466156 / 4 = 116539
            const result = await batchTrade(merkleBroker, { addresses, values })
            await printBalances(merkleBroker, userMap, assetMap)
            console.log('gas used', result.receipt.gasUsed)
        })
    })

    // base gas cost 26548
    // average gas cost for simple balance storage is 20613
    contract('simpleIncreaseBalance', async () => {
        it('increases user balance', async () => {
            const result1 = await merkleBroker.simpleIncreaseBalance(maker, t1, 100); // 47161
            console.log('gas used', result1.receipt.gasUsed) // 47161 - 26548 = 20613

            const result2 = await merkleBroker.simpleIncreaseBalance(maker, t1, 50); // 32161
            console.log('gas used', result2.receipt.gasUsed) // 32161 - 26548 = 5613
        })
    })

    // average gas cost for optimised balance storage: (21283 + 9923 * 3) / 4 = 12763
    // gas savings for new balance: 20613 - 12763 = 7850
    // additional gas needed for existing balances: 9923 - 5613 = 4310
    contract('optimisedIncreaseBalance', async () => {
        it('increases user balance', async () => {
            const vaultId = '0x01'
            const vaultAssets = ['0x0', '0x0', '0x0', '0x0']
            const vaultAmounts = [0, 0, 0, 0]
            const result1 = await merkleBroker.optimisedIncreaseBalance(maker, t1, 100, vaultId, vaultAssets, vaultAmounts); // 47831
            console.log('gas used', result1.receipt.gasUsed) // 47831 - 26548 = 21283

            vaultAssets[0] = t1
            vaultAmounts[0] = 100
            const result2 = await merkleBroker.optimisedIncreaseBalance(maker, t1, 50, vaultId, vaultAssets, vaultAmounts); // 36471
            console.log('gas used', result2.receipt.gasUsed) // 36471 - 26548 = 9923
        })
    })
})
