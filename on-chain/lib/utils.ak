/// Calcula health ratio como porcentaje entero.
/// Retorna: 140 = 140%, 120 = 120%, etc.
/// Requiere debt_amount > 0.
pub fn health_ratio(
  ada_locked: Int,
  debt_amount: Int,
  raw_price: Int,
  exponent: Int,
) -> Int {
  expect debt_amount > 0
  let abs_exp = if exponent < 0 { -exponent } else { exponent }
  let collateral_value = ada_locked * raw_price / pow(10, abs_exp)
  collateral_value * 100 / debt_amount
}

/// Verifica si health >= maintenance_ratio.
pub fn can_adjust(health: Int, maintenance: Int) -> Bool {
  health >= maintenance
}

/// Verifica si health < liquidation_ratio.
pub fn is_liquidatable(health: Int, liquidation: Int) -> Bool {
  health < liquidation
}

/// Calcula ADA (lovelaces) a entregar al liquidador (deuda + penalty).
pub fn liquidator_payout(
  debt_amount: Int,
  penalty_pct: Int,
  raw_price: Int,
  exponent: Int,
) -> Int {
  let debt_with_penalty = debt_amount + debt_amount * penalty_pct / 100
  let abs_exp = if exponent < 0 { -exponent } else { exponent }
  debt_with_penalty * pow(10, abs_exp) / raw_price
}

/// Calcula ADA (lovelaces) a entregar al protocolo como fee.
pub fn protocol_payout(
  debt_amount: Int,
  fee_pct: Int,
  raw_price: Int,
  exponent: Int,
) -> Int {
  let fee_amount = debt_amount * fee_pct / 100
  let abs_exp = if exponent < 0 { -exponent } else { exponent }
  fee_amount * pow(10, abs_exp) / raw_price
}

fn pow(base: Int, exp: Int) -> Int {
  if exp == 0 {
    1
  } else {
    base * pow(base, exp - 1)
  }
}
