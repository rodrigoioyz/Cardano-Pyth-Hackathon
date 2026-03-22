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

## 📐 Protocol Parameters

These values are set at deployment time and enforced entirely on-chain:

| Parameter | Value | Description |
|---|---|---|
| `collateral_ratio` | **150%** | You can mint at most 66% of your ADA's USD value in synth tokens |
| `liquidation_threshold` | **120%** | Positions below this health ratio can be liquidated by anyone |
| `ada_usd_feed_id` | **16** | Pyth Lazer feed ID for ADA/USD |

**Example:** Depositing 100 ADA at $0.70/ADA ($70 collateral value) → you can mint up to **$46.67 of synth-USD**. If ADA drops to $0.56, your health ratio hits 120% and the position becomes liquidatable.

---

## 👤 User Flow

### Minting synth-USD
1. User sends ADA to the protocol pool UTxO
2. On-chain validator fetches live ADA/USD price from Pyth Lazer
3. Calculates max synth: `synth = ada × price × (100 / collateral_ratio)`
4. Minting policy issues exactly that amount of synth tokens to the user's wallet

### Burning synth-USD (withdraw ADA)
1. User decides how much ADA to withdraw
2. Validator fetches live price from Pyth Lazer
3. Calculates synth to burn: `synth_burned = ada_withdrawn × price`
4. Verifies remaining position stays above 120% health
5. User signs the transaction — synth is burned, ADA returned

### Liquidation (undercollateralized position)
1. ADA price drops → a position's health falls below 120%
2. Any user can call `Liquidate`
3. Liquidator burns synth tokens, receives the equivalent ADA from the pool
4. No owner signature required — the health condition is the only gate

---

## 🛡️ Quality Assurance & Reliability

### Edge cases handled on-chain
- **Zero deposit/withdrawal blocked:** `ada_deposited >= 1` and `ada_withdrawn >= 1` enforced explicitly
- **Zero debt guard:** `health_ratio` fails immediately if `debt_amount == 0` — prevents division by zero
- **Double Option price unwrap:** Pyth feed returns `Option<Option<Int>>` — the validator explicitly handles `None` (field missing) and `Some(None)` (price unavailable), failing both cases
- **Single update enforced:** `expect [update] = updates` — rejects transactions with zero or multiple price messages

### Oracle failure handling
- If the Pyth withdraw script is not included in the transaction, `pyth.get_updates` returns an empty list and the validator fails — **no stale or missing price is ever accepted**
- The Ed25519 signature on each price message is verified by the Pyth verify script before our validator runs — invalid or replayed messages are rejected at the protocol level

### Price anomaly protection
- Price is read fresh from the oracle in every transaction — there is no cached or stored price in the datum
- The `collateral_ratio` and `liquidation_threshold` parameters provide a safety buffer against sudden price moves

---

## 💼 Business Development & Viability

### Target users
- ADA holders who want USD-denominated liquidity without selling their ADA
- DeFi users on Cardano seeking synthetic exposure to USD
- Protocols that need a decentralized, oracle-backed stablecoin primitive

### Market need
Cardano has existing decentralized stablecoins (DJED by COTI, iUSD by Indigo Protocol). Synth Peso **expands the offering** with a lightweight, single-collateral design that uses Pyth Lazer — a battle-tested, high-frequency oracle — rather than a custom price mechanism. This brings institutional-grade price feeds to Cardano CDP protocols.

### Competitive positioning

| Protocol | Oracle | Collateral | Chain |
|---|---|---|---|
| DJED (COTI) | Custom | ADA | Cardano |
| iUSD (Indigo) | Chainlink | ADA | Cardano |
| MakerDAO (DAI) | Chainlink | ETH/multi | Ethereum |
| **Synth Peso** | **Pyth Lazer** | **ADA** | **Cardano** |

Pyth Lazer offers sub-second price updates and is already used across 50+ chains — giving Synth Peso a credibility advantage at launch.

### Revenue model
Protocol fees collected on mint and liquidation events (configurable via protocol parameters). Fee revenue funds ongoing development and can be directed to a DAO treasury as the protocol matures.

### Scalability
- **No UTxO contention:** The Pyth State NFT is a reference input — any number of users can mint or burn in the same block without competing for the same UTxO
- **Permissionless liquidation:** Anyone can liquidate, eliminating the need for a centralized keeper network
- **Pyth partnership potential:** As Pyth expands its Cardano presence, Synth Peso is positioned to add new synthetic assets (BTC/USD, ETH/USD) by simply deploying new validator instances with different feed IDs

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
