// the mnemonic for ganache must be set to match these keys, see the README for more info
const PRIVATE_KEYS = {
    '0xdDAA33028987a2C8E3d3A35E77e504CD94877113': '346ed20528d2f002cfeed247a9c2d1defcac271ac3f9020065d31811d0f91c6c',
    '0x6CF202982Ed0823157FE1e30e8e6DA6353Cb0636': '220b549fb616e6182061da424b5d906efa17f897fb3962fb2fe7cb0cec33bb59',
    '0x2d5BbC32c7A2D95829474c094C141845f3175c48': '73248ae9468a70590ce108566cccbe0692a375051a5d2b93cc12884dd5968ae6',
    '0x6a8d87463c20CCd0d1FD8201Fe392e3d9E2bf7DD': 'a936145b457f3d6181a0918de90ac2f1c07d8f7913976a8bafcf1370f78d146a',
    '0xD2F099E427cB01475e36844E2824881129b0b7d6': '9128b854fc5475292d1cd99036b55865f2b1c864404dfd21f060b9c35f80fe5b'
}

function getPrivateKey(account) {
    return PRIVATE_KEYS[account]
}

module.exports = {
    PRIVATE_KEYS,
    getPrivateKey
}