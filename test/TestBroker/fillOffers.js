const Broker = artifacts.require('Broker')
const JRCoin = artifacts.require('JRCoin')
const SWCoin = artifacts.require('SWCoin')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { ETHER_ADDR, nonceGenerator, makeOffer, getOfferHash, fillOffers, fetchOffer } = require('../../utils/testUtils')

contract('Test fillOffers', async () => {
    let broker, jrcoin, swcoin, accounts, filler, makers, coordinator, operator
    let offers, offerHashes, initialBalanceState, users, assetIds

    const gen = nonceGenerator()
    const nextNonce = () => gen.next().value

    const mintAndDeposit = async (token, owner, amount) => {
        await token.mint(owner, amount)
        await token.approve(broker.address, owner, { from: owner })
        await broker.depositERC20(owner, token.address, amount)
    }

    const fetchBalanceState = async () => {
        const balanceState = {}
        for (const user of users) {
            balanceState[user] = {}
            for (const assetId of assetIds) {
                const balance = await broker.balances.call(user, assetId)
                balanceState[user][assetId] = balance
            }
        }
        return balanceState
    }

    const assertBalanceDistribution = async (expectedState = {}) => {
        const addressNames = {
            [filler]: 'filler',
            [makers[0]]: 'maker1',
            [makers[1]]: 'maker2',
            [makers[2]]: 'maker3',
            [ETHER_ADDR]: 'eth',
            [jrcoin.address]: 'jrcoin',
            [swcoin.address]: 'swcoin',
        }
        const currentState = await fetchBalanceState()
        for (const user of users) {
            for (const assetId of assetIds) {
                const currentBalance = currentState[user][assetId]
                let expectedBalance = initialBalanceState[user][assetId]
                if (expectedState[user] && expectedState[user][assetId]) {
                    expectedBalance = expectedState[user][assetId]
                }
                assert.equal(currentBalance.toString(), expectedBalance.toString(), `Match balance for ${addressNames[user]}, ${addressNames[assetId]}`)
            }
        }
    }

    const assertAvailableAmounts = async (availableAmounts) => {
        for (let i = 0; i < offerHashes.length; i++) {
            const offerHash = offerHashes[i]
            const offer = await fetchOffer(broker, offerHash)
            const availableAmount = availableAmounts[i]
            assert.equal(offer.availableAmount.toString(), availableAmount.toString(), 'Compare available amount for offer ' + (i + 1))
        }
    }

    beforeEach(async () => {
        broker = await Broker.deployed()
        jrcoin = await JRCoin.deployed()
        swcoin = await SWCoin.deployed()
        accounts = await web3.eth.getAccounts()

        coordinator = accounts[0]
        operator = accounts[0]
        filler = accounts[2]
        makers = [
            accounts[3],
            accounts[4],
            accounts[5]
        ]

        await mintAndDeposit(jrcoin, filler, 200)
        await mintAndDeposit(swcoin, makers[0], 10)
        await mintAndDeposit(swcoin, makers[1], 20)
        await mintAndDeposit(swcoin, makers[2], 30)

        const baseOffer = {
            offerAsset: swcoin.address,
            wantAsset: jrcoin.address,
            feeAsset: ETHER_ADDR,
            feeAmount: 0
        }

        const customOffers = [
            { maker: makers[0], offerAmount: 10, wantAmount: 20 },
            { maker: makers[1], offerAmount: 20, wantAmount: 50 },
            { maker: makers[2], offerAmount: 30, wantAmount: 100 }
        ]

        offers = []
        offerHashes = []
        for (const customOffer of customOffers) {
            const offer = { ...baseOffer, ...customOffer, nonce: nextNonce() }
            const offerHash = getOfferHash(offer)
            await makeOffer(broker, offer)
            offers.push(offer)
            offerHashes.push(offerHash)
        }

        users = [filler, ...makers]
        assetIds = [ETHER_ADDR, jrcoin.address, swcoin.address]
        initialBalanceState = await fetchBalanceState()
    })

    contract('when valid params are used', async () => {
        it('fills the input offers', async () => {
            const params = {
                filler,
                offerHashes,
                amountsToTake: [5, 20, 15],
                feeAsset: ETHER_ADDR,
                feeAmount: 0,
                nonce: nextNonce()
            }
            await fillOffers(broker, params)

            const jrAddr = jrcoin.address
            const swAddr = swcoin.address
            await assertBalanceDistribution({
                [filler]: {
                    [jrAddr]: 200 - (5 * 2) - (20 * 2.5) - (50),
                    [swAddr]: 5 + 20 + 15
                },
                [makers[0]]: {
                    [jrAddr]: 5 * 2
                },
                [makers[1]]: {
                    [jrAddr]: 20 * 2.5
                },
                [makers[2]]: {
                    [jrAddr]: 50
                }
            })
            await assertAvailableAmounts([5, 0, 15])
        })
    })
})
