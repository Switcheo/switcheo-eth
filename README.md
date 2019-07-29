# Switcheo Ethereum Broker Contract

This is the main DEX contract for [Switcheo Exchange](https://switcheo.exchange)

## Setup

1. Install [Truffle ^5.0.29](https://github.com/trufflesuite/truffle)
2. Install [Ganache ^2.1.0](https://truffleframework.com/ganache)
3. Run Ganache with the mnemonic: `ladder soft balcony kiwi sword shadow volcano reform cricket wall initial normal`
4. Install node modules with `npm install`
5. Install solc v0.4.25:
```
$ cd /usr/local/lib/node_modules/truffle
$ npm install solc@0.4.25
```
6. Run `truffle migrate` to deploy the contracts to Ganache
7. Run `truffle test` to run test files

## Definitions
### Broker contract
The Broker contract refers to the contract at `/contracts/Broker.sol` in this repository. Further references to "the contract", when not referring to other contracts, refer to this Broker contract.

### Users
A user refers to any entity that can interact with the Broker contract.

### Entitled balance
A user's entitled balance for a specified asset refers to the amount of the asset which the user has regular or partial control over within the contract.

If the user has regular control over the balance, then the user can use the balance to create or fill offers. The user can also choose to withdraw the assets represented by this balance from the contract to their Ethereum address.

A user has partial control over an asset if the user creates an offer. Creating an offer results in a specified amount of the user's entitled balance being locked into the offer. In this case the user has partial control over the asset, the locked amount cannot be used to create another offer, cannot be used to fill an offer and cannot be withdrawn from the contract, but the user can cancel the offer to regain regular control of the asset.

An entitled balance is associated to a user through the user's Ethereum address.

### Asset and balance ownership
The owner of an Ethereum address refers to any entity that has access to the private key of that address, and owns the assets associated to that Ethereum address by having the ability to initiate a transfer of the asset on the Ethereum network.

## Operations
### Increases in entitled balance
Within the contract, a user's entitled balance can only be increased by:
1. Depositing assets into the contract
2. Filling an offer, which would result in an increase corresponding to the amount given and the terms of the offer
3. Receiving fees

### Decreases in entitled balance
Within the contract, a user's entitled balance can only be decreased by:
1. Withdrawing assets from the contract
2. Creating an offer that becomes partially or fully filled
3. Filling an offer
4. Paying fees

### Trades
The purpose of an offer is to allow a user, referred to as the maker, to initiate a trade of one asset for another. The terms of the offer is specified as "X amount of Asset A for Y amount of Asset B".

The purpose of a fill is to allow a user, referred to as the filler, to fill an existing offer whether in full or partially.

If the offer becomes fully filled then:
1. The maker's entitled balance will increase by Y amount of Asset B and decrease by X amount of Asset A
2. The total change of entitled balances of all fillers of the offer corresponds to a decrease of Y amount of Asset B and an increase of X amount of Asset A
3. This is excluding any deduction of fees from the maker or the fillers

If the offer is partially filled then:
1. The maker's entitled balance will increase by a proportionate amount of Asset B and decrease by a proportionate amount of Asset A
2. The total change of entitled balances of all fillers of the offer corresponds to a proportionate decrease of Asset B and a proportionate increase of Asset A
3. This is excluding any deduction of fees from the maker of the fillers

The only means to unlock the amount locked into an offer is for the offer to be cancelled. Only the maker is able to cancel an offer, the exception to this is that the coordinator can cancel an offer the case of an emergency. Upon cancellation of an offer, the maker's unlocked entitled balance is increased by an amount corresponding to the amount offered by the maker, and locked into the offer, that has not been transferred to any filler of the offer, and that has not been previously unlocked through a previous cancellation.

Fees may be paid by the maker upon making the offer, and by the filler upon filling the offer, these fee deductions are approved by the user by having the user sign the fee parameters when making or filling an offer. If the make or fill succeeds, the appropriate amount of fee assets are transferred from the maker's or filler's entitled balance to the contract's specified operator's entitled balance.

### Permitted method invocation
Any contract method which results in a change or potential change, in the case of creating an offer, in the entitled balance associated to a particular user's Ethereum address, must be approved by the owner of that Ethereum address.

The contract requires this proof to show that the owner of the Ethereum address initiated the contract method's invocation and all parameters being used to call the method. This permission mechanism is robust in guarding against security threats including but not exclusive to impersonation or replay attacks. An entity that does not have access to a user's private key will not be able to initiate balance changes for that user within the contract. An entity with access to all previously sent parameters to the contract will not be able to repeat a method invocation using the same parameters.

The only exception to this is when the contract's specified operator's balance increases due to the reception of fees.

### Asset safety
The contract does not create or destroy any assets.
The contract can transfer ownership of assets only through the operations documented in the previous sections, with restrictions as specified, and through the concept of entitled balances. The contract guards against balance changes which do not follow the specified restrictions by preventing issues including but not exclusive to arithmetic overflows or underflows.

If X amount of Asset A is transferred into the contract, then a total of X amount of Asset A can always be withdrawn from the contract by the eventual owners of the X amount of the asset, regardless of any series of operations invoked on the contract. The only methods which result in a transfer of asset ownership is the filling of offers and the paying of fees.

A user can only withdraw from the contract an amount corresponding to their entitled balance. Only the owner of the Ethereum address associated with an entitled balance can withdraw the assets represented by that entitled balance, the only exception to this is the contract's specified coordinator, who can force withdrawals on behalf of users in the case of an emergency. A withdrawal can only ever transfer the assets represented by the entitled balance to the Ethereum address associated to that balance, this transfer would change the ownership of the assets from belonging to the contract to belonging to the owner of the Ethereum address.

At any point, the sum of all entitled balances of all users within the contract corresponds exactly to the amount of assets the contract has control over in the Ethereum network. This and the contract's methods guarantee that it is always possible for all users to fully withdraw their entitled balance from the contract, regardless of the action or inaction of any entity.

### Escape hatches
For most methods, the contract requires the invoker of the method to be the specified coordinator.

The exceptions to this are `announceCancel`, `slowCancel`, `announceWithdraw`, `slowWithdraw`. These methods ensure that users will always be able to withdraw the assets corresponding to their entitled balance from the contract, without the need for the coordinator.

### Emergency methods
For most methods, the contract requires proof that an entity with access to the Ethereum private key of the relevant address initiated the contract method's invocation.

The exceptions to this are `emergencyWithdraw` and `emergencyCancel`, these methods require the invoker of the method to be the specified coordinator and the contract's state be set to inactive.

This is to allow the coordinator to transfer entitled balances of users from the contract back to the users, in the case that circumstances require this course of action.

## Method Overview
An overview of the main methods in the Broker contract.

### depositEther
Transfers Ether from the user to the contract, and updates the entitled balance of the user within the contract.
Does not require the coordinator to invoke.

### depositERC20
Transfers an ERC20 token from the user to the contract, and updates the entitled balance of the user within the contract.
Requires only the coordinator to invoke, it requires the user to have previously approved the specified amount of their ERC20 token to be transferred to the contract.

### makeOffer
Makes an offer.
Requires the coordinator to invoke and proof that the maker of the offer initiated the action and acknowledges the parameters of the method call.

### fillOffer
Fills an offer.
Requires the coordinator to invoke and proof that the filler of the offer initiated the action and acknowledges the parameters of the method call.

### cancel
Cancels an offer.
Requires the coordinator to invoke and proof that the maker of the offer initiated the action and acknowledges the parameters of the method call.

### withdraw
Transfers assets from the contract to the user, and updates the entitled balance of the user within the contract.
Requires the coordinator to invoke and proof that the owner of the assets initiated the action and acknowledges the parameters of the method call.
