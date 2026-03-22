import {
  BlockfrostProvider,
  MeshTxBuilder,
  applyParamsToScript,
  serializeAddressObj,
  deserializeAddress,
  mConStr0,
  mBytes,
  mList,
  type UTxO,
  type BrowserWallet,
} from "@meshsdk/core";

import {
  UNPARAMETERISED_SCRIPT_CBOR,
  PARAMS,
  PYTH,
  computeMintAmount,
} from "./contract";

// ── Derive parameterised script once ─────────────────────────────────────────

function getScript() {
  // Apply the four compile-time parameters to get the final script CBOR.
  // Order must match the validator signature:
  //   synth_dolar(pyth_policy_id, ada_usd_feed_id, collateral_ratio, liquidation_threshold)
  const scriptCbor = applyParamsToScript(UNPARAMETERISED_SCRIPT_CBOR, [
    PARAMS.PYTH_POLICY_ID,
    PARAMS.ADA_USD_FEED_ID,
    PARAMS.COLLATERAL_RATIO,
    PARAMS.LIQUIDATION_THRESHOLD,
  ]);

  // The policy ID is the Blake2b-224 hash of the parameterised script.
  const { scriptHash } = deserializeAddress(
    serializeAddressObj({ scriptHash: scriptCbor }, 0) // derive hash only
  );

  // Bech32 script address on preprod (network id = 0).
  const poolAddress = serializeAddressObj({ scriptHash }, 0);

  return { scriptCbor, scriptHash, poolAddress };
}

// ── buildMintTx ───────────────────────────────────────────────────────────────

/**
 * Build, sign, and submit a Mint transaction.
 *
 * @param wallet         Connected CIP-30 browser wallet (MeshSDK BrowserWallet)
 * @param adaToDeposit   ADA amount the user wants to deposit (in lovelaces)
 * @param pythHex        Signed Pyth price message (solanaPayload from backend)
 * @param adaUsdPrice    Current ADA/USD price as a float (e.g. 0.70)
 * @param blockfrostKey  Blockfrost preprod project ID
 * @returns              Submitted transaction hash
 */
export async function buildMintTx(
  wallet: BrowserWallet,
  adaToDeposit: bigint,
  pythHex: string,
  adaUsdPrice: number,
  blockfrostKey: string
): Promise<string> {
  const provider = new BlockfrostProvider(blockfrostKey);
  const { scriptCbor, scriptHash, poolAddress } = getScript();

  // ── 1. Fetch UTxOs ────────────────────────────────────────────────────────

  // Pool UTxO — the single UTxO locked at the script address.
  const poolUtxos: UTxO[] = await provider.fetchAddressUtxos(poolAddress);
  if (poolUtxos.length === 0) throw new Error("Pool UTxO not found");
  const poolUtxo = poolUtxos[0];

  // Pyth State NFT UTxO — reference input carrying the oracle state.
  // The UTxO changes on every oracle update, so we query by address + asset name.
  const pythStateUnit = PARAMS.PYTH_POLICY_ID + PYTH.STATE_ASSET_NAME;
  const pythUtxos: UTxO[] = await provider.fetchAddressUtxos(PYTH.STATE_ADDRESS, pythStateUnit);
  if (pythUtxos.length === 0) throw new Error("Pyth State NFT UTxO not found");
  const stateUtxo = pythUtxos[0];

  // User UTxOs — for ADA input and collateral.
  const walletUtxos: UTxO[] = await wallet.getUtxos();
  const collateral: UTxO[] = await wallet.getCollateral();
  if (collateral.length === 0)
    throw new Error("No collateral set in wallet. Enable collateral in your wallet settings.");

  const walletAddress = await wallet.getChangeAddress();

  // ── 2. Compute amounts ────────────────────────────────────────────────────

  const mintAmount = computeMintAmount(adaToDeposit, adaUsdPrice);
  if (mintAmount <= 0n) throw new Error("Mint amount too small");

  const currentPoolLovelace = BigInt(
    poolUtxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0"
  );
  const newPoolLovelace = currentPoolLovelace + adaToDeposit;

  // ── 3. Build datums and redeemers ─────────────────────────────────────────

  // PoolDatum { owner: ByteArray } — Constr(0, [owner_pkh])
  const ownerPkh = deserializeAddress(walletAddress).pubKeyHash;
  const poolDatum = mConStr0([mBytes(ownerPkh)]);

  // Action.Mint — Constr(0, [])
  const mintRedeemer = mConStr0([]);

  // Pyth withdraw redeemer — List<ByteArray> with the signed price message.
  // The backend now returns solanaPayload (Solana wire format, magic b9011a82),
  // which is what the on-chain Pyth library expects.
  const pythRedeemer = mList([mBytes(pythHex)]);

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
    .txInRedeemerValue(mintRedeemer, "Mesh")
    .txInScript(scriptCbor)

    // Return pool UTxO with increased ADA + updated datum.
    .txOut(poolAddress, [{ unit: "lovelace", quantity: newPoolLovelace.toString() }])
    .txOutInlineDatumValue(poolDatum, "Mesh")

    // Mint synth tokens.
    .mintPlutusScriptV3()
    .mint(mintAmount.toString(), scriptHash, "")
    .mintingScript(scriptCbor)
    .mintRedeemerValue(mintRedeemer, "Mesh")

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
    .complete();

  const unsignedTx = txBuilder.txHex;
  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}
