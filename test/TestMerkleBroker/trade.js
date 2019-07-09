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

async function trade (merkleBroker, { users, assets, amounts, nonces }) {
    const offerHash = web3.utils.soliditySha3(
        { type: 'string', value: 'makeOffer' },
        { type: 'address', value: users[0] },
        { type: 'address', value: assets[0] },
        { type: 'address', value: assets[1] },
        { type: 'uint256', value: amounts[0] },
        { type: 'uint256', value: amounts[1] },
        { type: 'uint256', value: nonces[0] }
    )

    const fillHash = web3.utils.soliditySha3(
        { type: 'string', value: 'fillOffer' },
        { type: 'address', value: users[1] },
        { type: 'bytes32', value: offerHash },
        { type: 'uint256', value: amounts[2] },
        { type: 'address', value: assets[2] },
        { type: 'uint256', value: amounts[3] },
        { type: 'uint256', value: nonces[1] }
    )

    const offerSig = await getSignatureComponents(offerHash, users[0])
    const fillSig = await getSignatureComponents(fillHash, users[1])
    const v = [offerSig.v, fillSig.v]
    const r = [offerSig.r, fillSig.r]
    const s = [offerSig.s, fillSig.s]
    // const rs = [offerSig.r, fillSig.r, offerSig.s, fillSig.s]

    const result = await merkleBroker.trade(users, assets, amounts, nonces, v, r, s)
    // const result = await merkleBroker.trade(users.concat(assets), amounts, nonces, v, rs)
    return result
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

    contract('trade', async () => {
        it('performs a trade', async () => {
            await merkleBroker.deposit(maker, t1, 100) // 46005 for gas use
            await merkleBroker.deposit(taker, t2, 10)
            await merkleBroker.deposit(coordinator, t1, 1)
            await printBalances(merkleBroker, userMap, assetMap)

            const users = [maker, taker]
            const assets = [t1, t2, t1]
            const amounts = [100, 50, 10, 2]
            const nonces = [67, 89]

            await merkleBroker.markNonce(0)

            // 187178 gas: upper limit
            // 172152 gas: if coordinator already has fee asset
            // 144038 gas: with used nonces optimization
            // 114038 gas: if maker already has offer.wantAsset and taker already has offer.offerAsset
            const result = await trade(merkleBroker, { users, assets, amounts, nonces })
            await printBalances(merkleBroker, userMap, assetMap)
            console.log('gas used', result.receipt.gasUsed)
        })
    })
})
