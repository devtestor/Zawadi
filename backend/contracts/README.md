# Alcurry on-chain escrow audit trail

`ZawadiEscrowFactory.sol` is the public, immutable record of every Trade
that flows through Alcurry. The actual money stays in the platform's wallet
ledger — the chain only records *who agreed to what, when, and in what state*,
so disputes and auditors have something to point at.

## Why an EVM chain

We picked EVM because the tooling, RPC providers, and end-user familiarity
are unmatched. The contract is small and chain-agnostic — you can deploy it
to any EVM L1/L2 (Polygon, Base, Celo, Arbitrum, Optimism, BSC, ...). Defaults
in the repo target **Polygon Amoy** for testnet and **Polygon PoS** for
production because gas is cheap, finality is fast, and the chain is widely
used in East/Sub-Saharan Africa via partners like Celo and Flutterwave.

## Quick deploy (Foundry)

```bash
# Install Foundry (one time)
curl -L https://foundry.paradigm.xyz | bash
foundryup

cd backend/contracts
forge install foundry-rs/forge-std --no-commit

export POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
export PRIVATE_KEY=0x...   # the platform relayer key (fund it with a bit of MATIC)

# Build + deploy
forge build
forge script script/Deploy.s.sol:Deploy \
    --rpc-url polygon_amoy \
    --private-key $PRIVATE_KEY \
    --broadcast
```

The script prints the deployed address. Drop it into `backend/.env`:

```
CHAIN_ENABLED=true
CHAIN_NAME=polygon-amoy
CHAIN_ID=80002
CHAIN_RPC_URL=https://rpc-amoy.polygon.technology
CHAIN_PRIVATE_KEY=0x...        # same relayer key
CHAIN_ESCROW_FACTORY=0x...     # address printed above
CHAIN_EXPLORER_BASE_URL=https://amoy.polygonscan.com
```

Restart the backend. Every trade transition (create, sign, fund, deliver,
confirm, cancel, refund, dispute) now also emits an on-chain tx.

## Quick deploy (Remix, no CLI)

1. Open [remix.ethereum.org](https://remix.ethereum.org).
2. Create `ZawadiEscrowFactory.sol`, paste in `src/ZawadiEscrowFactory.sol`.
3. Compile with Solidity 0.8.24, optimizer on, 200 runs.
4. In the "Deploy & run transactions" panel, set environment to "Injected
   Provider — MetaMask", connect a wallet with some testnet MATIC.
5. Deploy. Copy the address shown in the Deployed Contracts list.
6. Drop it into `CHAIN_ESCROW_FACTORY` as above.

## Going to production

- Same contract source, deploy to Polygon mainnet (`--rpc-url polygon`).
- Fund the relayer wallet with real MATIC.
- Set `CHAIN_NAME=polygon` and `CHAIN_EXPLORER_BASE_URL=https://polygonscan.com`.
- Consider transferring ownership of the factory to a multisig (Safe) so a
  single compromised relayer key can't rewrite history. The contract has
  `transferOwnership(address)` for that.

## Why all writes are owner-gated

Buyer/seller addresses in the contract are **pseudonymous labels**, derived
deterministically from each user id (`keccak256("zawadi-user:" || userId)`).
They don't correspond to private keys held by users. The platform relayer
is the one signing on their behalf, after verifying off-chain that they took
the action via the authenticated API. This gives us:

- Zero-friction UX (no MetaMask, no gas paid by users).
- Public, immutable timeline of agreements + transitions.
- A single revocable key as the trust anchor; if it's lost or compromised,
  rotate via `transferOwnership` from the multisig.

If you ever need *user-signed* on-chain actions (true non-custodial mode),
the contract is small enough to fork into a permissionless v2 that accepts
EIP-712 signed messages.
