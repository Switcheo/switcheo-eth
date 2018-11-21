
const Broker = artifacts.require('Broker')
const Web3 = require('web3')
const web3 = new Web3(Web3.givenProvider)
const { ZERO_ADDR, ETHER_ADDR, assertError, assertRevert, assertEventEmission } = require('./helpers')

contract('Broker', function ([coordinator, notOwner, spender, from, to]) {
    const owner = coordinator

    beforeEach(async function () {
        this.broker = await Broker.new()
    })

    describe('add spender', function () {
        describe('when the sender is the owner', function () {
            describe('when the spender is not the zero address', function () {
                it('adds the spender to whitelist', async function () {
                    await this.broker.addSpender(spender, { from: owner });
                    const approved = await this.broker.whitelistedSpenders(spender);
                    assert.equal(approved, true);
                })
            })
            describe('when the spender is the zero address', function () {
                it('reverts', async function () {
                    await assertRevert(this.broker.addSpender(ZERO_ADDR, { from: owner }));
                })
            })
        })
        describe('when the sender is not the owner', function () {
            describe('when the spender is not the zero address', function () {
                it('reverts', async function () {
                    await assertRevert(this.broker.addSpender(spender, { from: notOwner }));
                })
            })
        })
    })

    describe('remove spender', function () {
        describe('when the sender is the owner', function () {
            describe('when the spender is not the zero address', function () {
                beforeEach(async function () {
                    await this.broker.addSpender(spender, { from: owner });
                })

                it('removes the spender from whitelist', async function () {
                    await this.broker.removeSpender(spender, { from: owner });
                    const approved = await this.broker.whitelistedSpenders(spender);
                    assert.equal(approved, false);
                })
            })
            describe('when the spender is the zero address', function () {
                it('reverts', async function () {
                    await assertRevert(this.broker.removeSpender(ZERO_ADDR, { from: owner }));
                })
            })
        })
        describe('when the sender is not the owner', function () {
            describe('when the spender is not the zero address', function () {
                beforeEach(async function () {
                    await this.broker.addSpender(spender, { from: owner });
                })

                it('reverts', async function () {
                    await assertRevert(this.broker.removeSpender(spender, { from: notOwner }));
                })
            })
        })
    })

    describe('approve spender', function () {
        describe('when the spender is in the whitelist', function () {
            beforeEach(async function () {
                await this.broker.addSpender(spender, { from: owner });
            })

            it('approves the spender', async function() {
                await this.broker.approveSpender(spender, { from })
                const approved = await this.broker.approvedSpenders(from, spender);
                assert.equal(approved, true)
            })

            it('emits an approval event', async function () {
                const { logs } = await this.broker.approveSpender(spender, { from })
                assertEventEmission(logs, [{
                    eventType: 'SpenderApprove',
                    args: {
                        user: from,
                        spender,
                    }
                }])
            })
        });
        describe('when the spender is not in the whitelist', function () {
            it('reverts', async function () {
                await assertRevert(this.broker.approveSpender(spender, { from }));
            })
        });
    });

    describe('rescind spender', function () {
        beforeEach(async function () {
            await this.broker.addSpender(spender, { from: owner })
        })

        describe('when the spender is approved', function () {
            beforeEach(async function () {
                await this.broker.approveSpender(spender, { from })
            })

            describe('when the spender has been un-whitelisted', function () {
                beforeEach(async function () {
                    await this.broker.removeSpender(spender, { from: owner })
                })

                it('rescinds spender approval', async function() {
                    await this.broker.rescindApproval(spender, { from })
                    const approved = await this.broker.approvedSpenders(from, spender);
                    assert.equal(approved, false)
                })

                it('emits a rescind event', async function () {
                    const { logs } = await this.broker.rescindApproval(spender, { from })
                    assertEventEmission(logs, [{
                        eventType: 'SpenderRescind',
                        args: {
                            user: from,
                            spender,
                        }
                    }])
                })
            })

            describe('when the spender is still whitelisted', function () {
                it('reverts', async function () {
                    await assertRevert(this.broker.rescindApproval(spender, { from }));
                })
            })
        });

        describe('when the spender is not approved', function () {
            describe('when the spender has been un-whitelisted', function () {
                beforeEach(async function () {
                    await this.broker.removeSpender(spender, { from: owner })
                })

                it('reverts', async function () {
                    await assertRevert(this.broker.rescindApproval(spender, { from }));
                })
            })

            describe('when the spender is still whitelisted', function () {
                it('reverts', async function () {
                    await assertRevert(this.broker.rescindApproval(spender, { from }));
                })
            })
        });
    });

    describe('spend from', function () {
        const decreaseReason = 0x90
        const increaseReason = 0x91
        const amount = 100

        beforeEach(async function () {
            await this.broker.addSpender(spender, { from: owner })
            await this.broker.depositEther.sendTransaction({ from, value: web3.utils.toWei('100', 'wei') })
        })

        describe('when the recipient is not the zero address', function () {
            describe('when the spender is approved', function () {
                beforeEach(async function () {
                    await this.broker.approveSpender(spender, { from })
                })

                describe('when the reason code is not used by the broker', function() {
                    describe('when the user has enough balance', function () {
                        it('transfers the requested amount', async function () {
                            await this.broker.spendFrom(from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender });

                            const senderBalance = await this.broker.balances(from, ETHER_ADDR);
                            assert.equal(senderBalance, 0);

                            const recipientBalance = await this.broker.balances(to, ETHER_ADDR);
                            assert.equal(recipientBalance, 100);
                        });

                        it('emits increase and decrease balance event', async function () {
                            const { logs } = await this.broker.spendFrom(from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender });
                            const expectedEvents = [
                                {
                                    eventType: 'BalanceDecrease',
                                    args: {
                                        user: from,
                                        token: ETHER_ADDR,
                                        amount: '100',
                                        reason: 0x90
                                    }
                                },
                                {
                                    eventType: 'BalanceIncrease',
                                    args: {
                                        user: to,
                                        token: ETHER_ADDR,
                                        amount: '100',
                                        reason: 0x91
                                    }
                                },
                            ]
                            assertEventEmission(logs, expectedEvents)
                        });
                    });

                    describe('when the user does not have enough balance', function () {
                        const amount = 101;
                        it('reverts', async function () {
                            await assertError(
                                this.broker.spendFrom, from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender }
                            );
                        });
                    });
                })

                describe('when the decrease reason code is used by the broker', function() {
                    const decreaseReason = 0x02

                    it('reverts', async function () {
                        await assertRevert(
                            this.broker.spendFrom(from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender })
                        );
                    });
                })

                describe('when the increase reason code is used by the broker', function() {
                    const increaseReason = 0x03

                    it('reverts', async function () {
                        await assertRevert(
                            this.broker.spendFrom(from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender })
                        );
                    });
                })

                describe('when the recipient is the zero address', function () {
                    const to = ZERO_ADDR;

                    it('reverts', async function () {
                        await assertRevert(
                            this.broker.spendFrom(from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender })
                        );
                    });
                });
            });

            describe('when the spender is not approved', function () {
                it('reverts', async function () {
                    await assertRevert(
                        this.broker.spendFrom(from, to, amount, ETHER_ADDR, decreaseReason, increaseReason, { from: spender })
                    );
                });
            });
        });
    });
});
