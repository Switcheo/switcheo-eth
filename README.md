# Switcheo Ethereum Broker Contract

This is the main DEX contract for [Switcheo Exchange](https://switcheo.exchange)

## Setup

1. Install [Truffle ^5.0.29](https://github.com/trufflesuite/truffle)
2. Install [Ganache-CLI ^6.5.0](https://github.com/trufflesuite/ganache-cli/tree/v6.5.0)
```
$ npm install ganache-cli@latest -g
```
3. Run Ganache-CLI with:
```
$ ganache-cli -m "ladder soft balcony kiwi sword shadow volcano reform cricket wall initial normal" -p 7545 -l 8000000
```
4. Install node modules with `npm install`
5. Install solc v0.5.12:
```
$ cd /usr/local/lib/node_modules/truffle
$ npm install solc@0.5.12
```
6. Run `truffle migrate` to deploy the contracts to Ganache
7. Run `truffle test` to run test files
8. `truffle test test/TestBrokerV2/trade/*.js` can be used to test files in a folder

## Project Structure
```
.
├── contracts
│   ├── BrokerV2.sol              # Main exchange contract
│   ├── Migrations.sol            # Truffle's migration contract
│   ├── Utils.sol                 # Utility library
│   ├── extensions                # Contracts to extend BrokerV2 features
│   ├── lib                       # OpenZeppelin contracts
│   ├── markets                   # Market contracts for testing
│   └── tokens                    # Token contracts for testing
├── migrations                    # Migration files
├── test                          # Test files
```

## Main Features
The BrokerV2 contract facilitates trading between users.
The trades occur securely by requiring users to sign all actions concerning their funds with their Ethereum private key.

Users can deposit funds, make offers, fill offers, cancel offers, perform atomic swaps and withdraw funds.

## Extensions
In addition to the main features, the BrokerV2 contract allows for extensibility through spender contracts and market DApps.

Spender contracts allow the `BrokerV2.owner` to whitelist new Ethereum contracts with new features. After a spender contract is whitelisted, a user can enable the new features by individually approving the spender contract to transfer funds on their behalf.

Market DApps allow offers to be filled by external markets. For example, `KyberSwapDapp.sol` allows offers to be filled by the [KyberSwap DApp](https://kyberswap.com) while `UniswapDapp.sol` allows offers to be filled by the [Uniswap DApp](https://uniswap.io).

## Escape hatches
The BrokerV2 contract provides escape hatches using the methods `announceCancel`, `slowCancel`, `announceWithdraw`, `slowWithdraw`.

These methods ensure that users will always be able to withdraw their funds without having to rely on the owner or admin of the BrokerV2 contract.

## Emergency methods
The BrokerV2 contract provides `adminWithdraw` and `adminCancel` methods which do not require user signatures. These methods can be invoked if the `BrokerV2.adminState` is `Escalated` and the invoker of the method is an admin address.

This is to allow contract admin to transfer entitled balances of users from the contract back to the users, in the case of an emergency or contract upgrade.
