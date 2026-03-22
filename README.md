🚀 Pyth Cardano Hackathon 2026

Team: Los Magníficos!
Agustin Salinas (@AgustinBadi)
Mauricio Navarrete (@lordkhyron)
Rodrigo Oyarzun (@Rodrigoioyz)
Contact: librenotgratis@tuta.io

📋 Contribution Information

| Category | Details |
|---|---|
| Contribution Type | ✅ Hackathon Submission |
| Project Name | Synth Peso |
| Pyth Product | 🟢 Pyth Price Feeds (Pyth Lazer) |
| Blockchain | ₳ Cardano |

---

## 📝 What is Synth Peso?

**Synth Peso** is a synthetic ADA/USD stablecoin protocol built on Cardano. Users lock ADA as collateral and mint synth tokens pegged to the USD value of that ADA, as determined in real-time by the **Pyth Lazer oracle**. Burning synth tokens returns the corresponding ADA from the collateral pool.

The protocol enforces:
- **Overcollateralization** — you can only mint a fraction of your ADA's USD value (controlled by `collateral_ratio`)
- **Health checks on withdrawal** — you cannot burn synth and withdraw ADA if it leaves the position below the liquidation threshold
- **Open liquidation** — anyone can liquidate an undercollateralized position
- **Owner-only burns** — only the position owner (verified via signature) can voluntarily burn and withdraw

---

## ⚙️ How It Works

### Mint (ADA → Synth USD)

1. User sends ADA to the pool UTxO
2. The on-chain validator reads the live ADA/USD price from Pyth Lazer
3. It computes: `synth_to_mint = (ada_deposited × collateral_ratio / 100) × price`
4. The minting policy mints exactly that amount of synth tokens to the user

### Burn (Synth USD → ADA)

1. User specifies how much ADA to withdraw from the pool
2. Validator reads live oracle price
3. Computes synth to burn: `synth_burned = ada_withdrawn × raw_price / 10^abs_exp`
4. Checks remaining position health: `health = (remaining_ada × raw_price / 10^abs_exp) / remaining_debt ≥ liquidation_threshold`
5. Verifies the transaction is signed by the position owner
6. ADA is released from the pool

### Liquidate

1. Any user can trigger liquidation on an undercollateralized position (`health < liquidation_threshold`)
2. The liquidator burns synth tokens and receives the corresponding ADA from the pool
3. No owner signature required — the position's health condition is the only gate

---

## 🔮 How Pyth Lazer is Used

The contract uses [`pyth-network/pyth-lazer-cardano`](https://github.com/pyth-network/pyth-lazer-cardano) (pinned at commit `f78b676`).

### On-chain price reading

```aiken
let updates = pyth.get_updates(pyth_policy_id, tx)
expect [update] = updates
expect Some(feed) = list.find(feeds, fn(f) { u32.as_int(f.feed_id) == ada_usd_feed_id })
expect Some(Some(raw_price)) = feed.price
expect Some(exponent) = feed.exponent
// real_price = raw_price × 10^exponent
```

### How the price reaches the contract

Every mint/burn/liquidate transaction must include:

1. **Pyth State NFT** as a reference input (identified by `pyth_policy_id`) — never spent
2. **A 0-ADA withdrawal** from the Pyth verify script, carrying the signed price message as the redeemer

The Pyth verify script validates the **Ed25519 signature** on each price message before the main validator runs. By the time `get_updates` is called, the price is already cryptographically authenticated.

### Price feed

- **Asset:** ADA/USD
- **Feed ID:** 16
- **Exponent:** -8 (i.e. `raw_price = 70_000_000` → `$0.70 per ADA`)
- **No contention:** The Pyth State NFT is a reference input — multiple users can mint/burn in the same block without UTxO conflicts

---

## 🛠️ How to Build

### Prerequisites

- [Aiken](https://aiken-lang.org) v1.1.19

```bash
aikup install v1.1.19
```

### Build

```bash
cd on-chain
aiken build
```

This compiles the contracts and generates `on-chain/plutus.json` (the Plutus blueprint).

### Run tests

```bash
cd on-chain
aiken check
```

All 25 unit tests in `lib/utils.ak` cover:
- `health_ratio` — collateral/debt ratio calculation
- `can_adjust` / `is_liquidatable` — position health gates
- `liquidator_payout` / `protocol_payout` — ADA distribution on liquidation
- `compute_expected_synth_amount` — ADA → synth USD conversion (mint and burn directions)

### Project structure

```
on-chain/
  validators/
    synth-dolar.ak     # Main validator: mint policy + spend guard
  lib/
    utils.ak           # Math helpers + 25 unit tests
    types/
      cdp.ak           # CdpDatum type
  aiken.toml           # Dependencies
```

---

✅ Quality Checklist

- [x] Make it beautiful: Clean hierarchy and formatting.
- [x] Code Standards: Follows existing repository patterns.
- [x] Security: No hardcoded values; uses environment variables.
- [x] Verification: Locally tested and verified.
