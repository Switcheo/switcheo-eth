const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)

const { soliditySha3, keccak256 } = web3.utils

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const ONE_ADDR = '0x0000000000000000000000000000000000000001'
const ETHER_ADDR = '0x0000000000000000000000000000000000000000'

const MAX_SLOW_CANCEL_DELAY = 604800
const MAX_SLOW_WITHDRAW_DELAY = 604800

const DOMAIN_TYPE_HASH = web3.utils.soliditySha3(
    {
        type: 'string',
        value: 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)'
    }
)

const CONTRACT_NAME = keccak256('Switcheo Exchange')
const CONTRACT_VERSION = keccak256('2')
const CHAIN_ID = 3
const VERIFYING_CONTRACT = '0x0000000000000000000000000000000000000001'
const SALT = keccak256('switcheo-eth-eip712-salt')

const DOMAIN_SEPARATOR = keccak256(web3.eth.abi.encodeParameters(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address', 'bytes32'],
    [DOMAIN_TYPE_HASH, CONTRACT_NAME, CONTRACT_VERSION, CHAIN_ID, VERIFYING_CONTRACT, SALT]
))

/* eslint-disable max-len */
const TYPEHASHES = {
    AUTHORIZE_SPENDER_TYPEHASH: soliditySha3({
        type: 'string',
        value: 'AuthorizeSpender(address user,address spender,uint256 nonce)'
    }),
    WITHDRAW_TYPEHASH: soliditySha3({
        type: 'string',
        value: 'Withdraw(address withdrawer,address receivingAddress,address assetId,uint256 amount,address feeAssetId,uint256 feeAmount,uint256 nonce)'
    }),
    CANCEL_TYPEHASH: soliditySha3({
        type: 'string',
        value: 'Cancel(bytes32 offerHash,address feeAssetId,uint256 feeAmount)'
    }),
    OFFER_TYPEHASH: soliditySha3({
        type: 'string',
        value: 'Offer(address maker,address offerAssetId,uint256 offerAmount,address wantAssetId,uint256 wantAmount,address feeAssetId,uint256 feeAmount,uint256 nonce)'
    }),
    FILL_TYPEHASH: soliditySha3({
        type: 'string',
        value: 'Fill(address filler,address offerAssetId,uint256 offerAmount,address wantAssetId,uint256 wantAmount,address feeAssetId,uint256 feeAmount,uint256 nonce)'
    }),
    SWAP_TYPEHASH: soliditySha3({
        type: 'string',
        value: 'Swap(address maker,address taker,address assetId,uint256 amount,bytes32 hashedSecret,uint256 expiryTime,address feeAssetId,uint256 feeAmount,uint256 nonce)'
    })
}

const REASON_CODES = {
    REASON_DEPOSIT: 0x01
}

module.exports = {
    ZERO_ADDR,
    ONE_ADDR,
    ETHER_ADDR,
    MAX_SLOW_CANCEL_DELAY,
    MAX_SLOW_WITHDRAW_DELAY,
    DOMAIN_SEPARATOR,
    TYPEHASHES,
    REASON_CODES
}
