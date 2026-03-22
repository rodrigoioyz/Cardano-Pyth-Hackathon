import {
  BlockfrostProvider,
  MeshTxBuilder,
  applyParamsToScript,
  serializePlutusScript,
  resolvePlutusScriptHash,
  deserializeAddress,
  mConStr0,
  mConStr1,
  type UTxO,
  type BrowserWallet,
} from "@meshsdk/core";

import {
  UNPARAMETERISED_SCRIPT_CBOR,
  PARAMS,
  PYTH,
  computeBurnReturn,
} from "./contract";

// ── Derive parameterised script once ─────────────────────────────────────────

function getScript() {
  const scriptCbor = applyParamsToScript(UNPARAMETERISED_SCRIPT_CBOR, [
    PARAMS.PYTH_POLICY_ID,
    PARAMS.ADA_USD_FEED_ID,
    PARAMS.COLLATERAL_RATIO,
    PARAMS.LIQUIDATION_THRESHOLD,
  ]);

  const script = { code: scriptCbor, version: "V3" as const };
  const poolAddress = serializePlutusScript(script, undefined, 0).address;
  const scriptHash = resolvePlutusScriptHash(poolAddress);

  return { scriptCbor, scriptHash, poolAddress };
}

// ── buildBurnTx ───────────────────────────────────────────────────────────────

/**
 * Build, sign, and submit a Burn transaction.
 *
 * @param wallet         Connected CIP-30 browser wallet (MeshSDK BrowserWallet)
 * @param synthToBurn    Synth token amount to burn (in micro-USD, 6 decimals)
 * @param pythHex        Signed Pyth price message (solanaPayload from backend)
 * @param adaUsdPrice    Current ADA/USD price as a float (e.g. 0.70)
 * @param blockfrostKey  Blockfrost preprod project ID
 * @returns              Submitted transaction hash
 */
export async function buildBurnTx(
  wallet: BrowserWallet,
  synthToBurn: bigint,
  pythHex: string,
  adaUsdPrice: number,
  blockfrostKey: string
): Promise<string> {
  const provider = new BlockfrostProvider(blockfrostKey);
  const { scriptCbor, scriptHash, poolAddress } = getScript();

  // ── 1. Fetch UTxOs ────────────────────────────────────────────────────────

  // Pool UTxO — the single UTxO locked at the script address.
  const poolUtxos: UTxO[] = await provider.fetchAddressUTxOs(poolAddress);
  if (poolUtxos.length === 0) throw new Error("Pool UTxO not found");
  const poolUtxo = poolUtxos[0];

  // Pyth State NFT UTxO — reference input carrying the oracle state.
  const pythStateUnit = PARAMS.PYTH_POLICY_ID + PYTH.STATE_ASSET_NAME;
  const pythUtxos: UTxO[] = await provider.fetchAddressUTxOs(PYTH.STATE_ADDRESS, pythStateUnit);
  if (pythUtxos.length === 0) throw new Error("Pyth State NFT UTxO not found");
  const stateUtxo = pythUtxos[0];

  // User UTxOs — for synth token input and collateral.
  const walletUtxos: UTxO[] = await wallet.getUtxos();
  const collateral: UTxO[] = await wallet.getCollateral();
  if (collateral.length === 0)
    throw new Error("No collateral set in wallet. Enable collateral in your wallet settings.");

  const walletAddress = await wallet.getChangeAddress();

  // ── 2. Compute amounts ────────────────────────────────────────────────────

  const adaToReturn = computeBurnReturn(synthToBurn, adaUsdPrice);
  if (adaToReturn <= 0n) throw new Error("ADA return amount too small");

  const currentPoolLovelace = BigInt(
    poolUtxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0"
  );
  if (adaToReturn > currentPoolLovelace)
    throw new Error("Insufficient ADA in pool for this burn amount");

  const newPoolLovelace = currentPoolLovelace - adaToReturn;

  // ── 3. Build datums and redeemers ─────────────────────────────────────────

  // Keep the existing pool datum (owner stays the same).
  // In Mesh "Data" format: ByteArray is a plain hex string, Constr is mConStr0.
  const ownerPkh = deserializeAddress(walletAddress).pubKeyHash;
  const poolDatum = mConStr0([ownerPkh]);

  // Action.Burn — Constr(1, [])
  const burnRedeemer = mConStr1([]);

  // Pyth withdraw redeemer — List<ByteArray> with the signed price message.
  const pythRedeemer = [pythHex];

  const col = collateral[0];

  // ── 4. Build transaction ──────────────────────────────────────────────────

  const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });

  await txBuilder
    // Spend the pool UTxO (spend validator delegates to mint validator).
    .spendingPlutusScriptV3()
    .txIn(
      poolUtxo.input.txHash,
      poolUtxo.input.outputIndex,
      poolUtxo.output.amount,
      poolUtxo.output.address
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(burnRedeemer, "Mesh")
    .txInScript(scriptCbor)

    // Return pool UTxO with decreased ADA + same datum.
    .txOut(poolAddress, [{ unit: "lovelace", quantity: newPoolLovelace.toString() }])
    .txOutInlineDatumValue(poolDatum, "Mesh")

    // Burn synth tokens (negative mint amount).
    .mintPlutusScriptV3()
    .mint((-synthToBurn).toString(), scriptHash, "")
    .mintingScript(scriptCbor)
    .mintRedeemerValue(burnRedeemer, "Mesh")

    // Pyth State NFT as reference input (never spent).
    .readOnlyTxInReference(stateUtxo.input.txHash, stateUtxo.input.outputIndex)

    // Zero-ADA withdrawal from Pyth verify script — carries the signed price message.
    .withdrawal(PYTH.WITHDRAW_ADDRESS, "0")
    .withdrawalPlutusScriptV3()
    .withdrawalScript(PYTH.WITHDRAW_SCRIPT_CBOR)
    .withdrawalRedeemerValue(pythRedeemer, "Mesh")

    // Collateral + change.
    .txInCollateral(
      col.input.txHash,
      col.input.outputIndex,
      col.output.amount,
      col.output.address
    )
    .changeAddress(walletAddress)
    .selectUtxosFrom(walletUtxos)
    .requiredSignerHash(ownerPkh) // Burn requires owner signature (on-chain check)
    .complete();

  const unsignedTx = txBuilder.txHex;
  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}
