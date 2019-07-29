const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { soliditySha3, keccak256 } = web3.utils

const ETHER_ADDR = '0x0000000000000000000000000000000000000000'

const DOMAIN_TYPE_HASH = web3.utils.soliditySha3(
    {
        type: 'string',
        value: 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)'
    }
)

const CONTRACT_NAME = web3.utils.keccak256('Switcheo Exchange')
const CONTRACT_VERSION = web3.utils.keccak256('2')
const CHAIN_ID = 3
const VERIFYING_CONTRACT = '0x0000000000000000000000000000000000000001'
const SALT = web3.utils.keccak256('switcheo-eth-eip712-salt')

const DOMAIN_SEPARATOR = web3.utils.keccak256(web3.eth.abi.encodeParameters(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address', 'bytes32'],
    [DOMAIN_TYPE_HASH, CONTRACT_NAME, CONTRACT_VERSION, CHAIN_ID, VERIFYING_CONTRACT, SALT]
))

const WITHDRAW_TYPEHASH = soliditySha3({
    type: 'string',
    value: 'Withdraw(address withdrawer,address assetId,uint256 amount,address feeAssetId,uint256 feeAmount,uint256 nonce)'
})

module.exports = {
    ETHER_ADDR,
    DOMAIN_SEPARATOR,
    WITHDRAW_TYPEHASH
}
