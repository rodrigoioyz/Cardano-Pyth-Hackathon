# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Synth Peso** — a synthetic ADA/USD asset on Cardano, using Pyth Lazer as the price oracle. Users mint synth tokens by depositing ADA (price determined by oracle), and burn synth tokens to reclaim the corresponding ADA from the pool.

## Repository layout

```
on-chain/       Aiken smart contracts (los-magnificos/synth-peso)
reference/      Original hackathon repo examples (entropy, lazer, price_feeds) — not used
```

## On-chain (Aiken)

All contract work happens inside `on-chain/`. Commands must be run from that directory.

```bash
cd on-chain
aiken check          # type-check + run all tests
aiken build          # compile to Plutus blueprints → plutus.json
aiken check -m foo   # run only tests matching pattern "foo"
aiken docs           # generate HTML documentation
```

### Dependencies (`aiken.toml`)
- `aiken-lang/stdlib v3.0.0`
- `pyth-network/pyth-lazer-cardano` (pinned commit `f78b676`) — Pyth Lazer on-chain SDK

### Pyth Lazer integration

The key entry point from `pyth-lazer-cardano`:

```aiken
use pyth.{get_updates, PriceUpdate, Feed}

let updates: List<PriceUpdate> = pyth.get_updates(pyth_policy_id, transaction)
```

`get_updates` requires:
- A **Pyth State NFT** reference input (PolicyId passed as parameter, token name `"Pyth State"`)
- Price messages submitted via the **withdraw script redeemer** as `List<ByteArray>` (handled by the oracle relayer, not our contract)

`get_updates` reads the Pyth redeemer internally via:
```aiken
pairs.get_first(tx.redeemers, Withdraw(Script(withdraw_script_hash)))
```
The redeemer form is `List<ByteArray>` — each `ByteArray` is a signed Pyth price message. The withdraw script verifies the Ed25519 signature on each message; by the time our validator runs, the price is already authenticated.

Each `ByteArray` message has the following binary structure (Solana wire format):
```
[4 bytes]  magic: b9011a82 (little-endian)
[64 bytes] Ed25519 signature
[32 bytes] public key
[2 bytes]  payload length (little-endian u16)
[N bytes]  payload
```

The payload itself is structured as:
```
[4 bytes]  magic: 75d3c793 (little-endian)
[8 bytes]  timestamp_us (little-endian u64)
[1 byte]   channel_id
[1 byte]   number of feeds
[...]      feeds (each: 4-byte feed_id + 1-byte property count + properties)
```

Each `Feed` contains:
- `feed_id: U32` — asset identifier (e.g., ADA/USD has a specific ID)
- `price: Option<Option<Int>>` — raw integer price (`Some(None)` = unavailable, `Some(Some(p))` = valid)
- `exponent: Option<Int>` — scale factor; real price = `price × 10^exponent`

### Protocol specification

**Mint (ADA → synth USD):**
- Off-chain: query Pyth Lazer API for ADA/USD price + signature; build tx with Pyth State as reference input + 0-withdrawal from Pyth verify script carrying the signed price bytes as redeemer
- On-chain inputs: pool UTxO (ADA collateral) + user's ADA
- On-chain outputs: minted synth tokens to user + new pool UTxO (with increased ADA)

**Burn (synth USD → ADA):**
- Off-chain: same oracle query + tx construction
- On-chain inputs: pool UTxO + user's synth tokens
- On-chain outputs: ADA returned to user + new pool UTxO (with decreased ADA)

**Key insight — no UTxO contention:** The Pyth State NFT UTxO is **never spent**. It is always a `reference_input`. The price update is pushed by the user as a withdrawal redeemer (`Withdraw(Script(pyth_withdraw_script))`). The withdraw script verifies the Ed25519 signature. Multiple users can mint/burn in the same block without contention.

### Architecture

Two validators run together in every mint/burn transaction:

1. **`mint` policy** — controls synth token supply; verifies oracle price and that the correct amount of synth tokens is minted/burned relative to ADA deposited/withdrawn
2. **`spend` validator** — guards the **pool UTxO** (ADA collateral); enforces the eUTxO state machine (pool UTxO must be spent and recreated with updated ADA balance)

The **Pyth State NFT** is a **reference input** (not spent) — the oracle relayer submits price messages via a withdraw script redeemer in the same transaction. The pool UTxO is what gets spent and recreated each time.

### Validator structure

`validators/placeholder.ak` is the entry point to replace. Target structure:
- `mint` handler — oracle price lookup, synth amount calculation, allow mint/burn
- `spend` handler — pool UTxO continuity check, ADA balance update

### Plutus version
Plutus v3 — use `ScriptContext` patterns accordingly.
