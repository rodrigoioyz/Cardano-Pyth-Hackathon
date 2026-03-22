use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference}

pub type Action {
  Mint
  Burn
}

validator synth_dolar(pyth_policy_id: PolicyId, ada_usd_feed_id: Int) {
  mint(_redeemer: Action, _policy_id: PolicyId, _self: Transaction) {
    todo @"mint logic goes here"
  }

  spend(_datum: Option<Data>, _redeemer: Action, _utxo: OutputReference, _self: Transaction) {
    todo @"spend logic goes here"
  }

  else(_ctx) {
    fail
  }
}
