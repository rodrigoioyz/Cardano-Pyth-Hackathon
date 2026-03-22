use aiken/collection/dict
use aiken/collection/list
use cardano/address.{Script}
use cardano/assets.{PolicyId, lovelace_of, tokens}
use cardano/transaction.{Transaction, OutputReference}
use pyth
use pyth.{PriceUpdate}
use types/u32

pub type Action {
  Mint
  Burn
  Liquidate
}

validator synth_dolar(pyth_policy_id: PolicyId, ada_usd_feed_id: Int) {
  mint(_redeemer: Action, _policy_id: PolicyId, _self: Transaction) {
    let (raw_price, exponent) =
      get_ada_usd_price(pyth_policy_id, ada_usd_feed_id, _self)

    let Transaction { inputs, outputs, .. } = _self

    let ada_deposited = get_ada_delta(_policy_id, _redeemer, inputs, outputs)

    let Transaction { mint, .. } = _self
    let minted_amount = get_minted_amount(mint, _policy_id)

    todo @"mint logic goes here"
  }

  spend(_datum: Option<Data>, _redeemer: Action, _utxo: OutputReference, _self: Transaction) {
    todo @"spend logic goes here"
  }

  else(_ctx) {
    fail
  }
}

/// Fetches the ADA/USD raw price and exponent from Pyth Lazer.
///
/// Requires the transaction to include:
///   - A Pyth State NFT reference input (identified by `pyth_policy_id`)
///   - A 0-ADA withdrawal from the Pyth verify script carrying the signed
///     price message as redeemer — verified by that script, not here.
///
/// Returns `(raw_price, exponent)` where the real price in USD is:
///   real_price = raw_price × 10^exponent
///
/// For ADA/USD (feed_id=16, exponent=-8):
///   raw_price = 70_000_000  →  $0.70 per ADA
fn get_ada_usd_price(
  pyth_policy_id: PolicyId,
  ada_usd_feed_id: Int,
  tx: Transaction,
) -> (Int, Int) {
  // Pull all price updates from the transaction — the Pyth withdraw script
  // has already verified the Ed25519 signature by the time we get here.
  let updates = pyth.get_updates(pyth_policy_id, tx)

  // We expect exactly one price update message per transaction.
  expect [update] = updates
  let PriceUpdate { feeds, .. } = update

  // Find the feed matching our target asset (ADA/USD = feed_id 16).
  expect Some(feed) =
    list.find(feeds, fn(f) { u32.as_int(f.feed_id) == ada_usd_feed_id })

  // Unwrap the price — the double Option means:
  //   None         → field not included in this update (fail)
  //   Some(None)   → price unavailable from publishers (fail)
  //   Some(Some(p) → valid price ✓
  expect Some(Some(raw_price)) = feed.price

  // Exponent scales the raw integer to a real USD value:
  //   real_price = raw_price × 10^exponent
  expect Some(exponent) = feed.exponent

  (raw_price, exponent)
}

/// Returns the total quantity of tokens minted or burned under a given policy.
/// Positive = minting, negative = burning.
fn get_minted_amount(mint: assets.Value, policy_id: PolicyId) -> Int {
  tokens(mint, policy_id)
    |> dict.values()
    |> list.foldl(0, fn(qty, acc) { acc + qty })
}

/// Finds the pool input and output UTxOs at the script address and returns
/// the absolute ADA delta between them.
///
/// The caller uses the `Action` redeemer to interpret the direction:
///   Mint → delta is ADA deposited  (output > input)
///   Burn → delta is ADA withdrawn  (input > output)
fn get_ada_delta(
  policy_id: PolicyId,
  action: Action,
  inputs: List<transaction.Input>,
  outputs: List<transaction.Output>,
) -> Int {
  expect Some(pool_input) =
    list.find(
      inputs,
      fn(i) { i.output.address.payment_credential == Script(policy_id) },
    )
  expect Some(pool_output) =
    list.find(
      outputs,
      fn(o) { o.address.payment_credential == Script(policy_id) },
    )

  let input_lovelace = lovelace_of(pool_input.output.value)
  let output_lovelace = lovelace_of(pool_output.value)

  when action is {
    Mint -> output_lovelace - input_lovelace
    Burn -> input_lovelace - output_lovelace
  }
}
