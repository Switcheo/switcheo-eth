contract('Test getBalances', async (accounts) => {
    contract('when parameters are valid', async () => {
        it('adds an admin', async () => {
            await assertAsync(broker.isAdmin(user), false)
            await broker.addAdmin(user)
            await assertAsync(broker.isAdmin(user), true)
        })
    })
})
