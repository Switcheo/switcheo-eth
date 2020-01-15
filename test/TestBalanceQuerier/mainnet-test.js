const Web3 = require('web3')

const PrivateKeyProvider = require('truffle-privatekey-provider')
const provider = new PrivateKeyProvider(
    process.env.controlKey,
    'https://mainnet.infura.io/v3/' + process.env.infuraKey
)

const BALANCE_QUERIER_ABI = [{"constant":true,"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address[]","name":"assetIds","type":"address[]"}],"name":"getBalances","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"payable":false,"stateMutability":"view","type":"function"}]

const web3 = new Web3(provider)
const balanceQuerierAddress = '0xf4b60c232b32e3546c6364df280b2ea98f5fdd3e'

async function printBalances() {
    const contract = new web3.eth.Contract(BALANCE_QUERIER_ABI, balanceQuerierAddress)
    const result = await contract.methods.getBalances(
        '0x0A2A34CDFbADE6634d902D0D0a8Dc7533d26f7E3',
        ['0xd26114cd6ee289accf82350c8d8487fedb8a0c07', '0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c']
    ).call()
    console.log('result', result)
}

printBalances()
