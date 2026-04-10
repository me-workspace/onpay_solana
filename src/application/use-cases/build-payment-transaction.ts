/**
 * Use case: Build Payment Transaction (the Week 1 critical spike).
 *
 * Given an invoice, the buyer's wallet pubkey, and the SPL token the buyer
 * wants to pay with, this builds a single atomic Solana transaction that:
 *
 *   1. Creates the merchant's USDC associated token account if it does not
 *      already exist (idempotent — buyer pays the rent of ~0.002 SOL).
 *   2. Runs the Jupiter swap from the buyer's input token directly into the
 *      merchant's USDC ATA (Jupiter's `destinationTokenAccount` parameter
 *      eliminates the need for a separate transfer instruction).
 *   3. Includes a memo with the invoice reference for on-chain indexing.
 *
 * The transaction is composed as a versioned (v0) transaction with Address
 * Lookup Tables, which is required to fit complex Jupiter routes inside
 * Solana's 1232-byte transaction size limit.
 *
 * Returns the unsigned transaction as base64. The buyer's wallet will sign
 * and broadcast it via the Solana Pay Transaction Request flow.
 *
 * NOTE on `@solana/web3.js` imports here:
 * The application layer normally avoids infra-specific imports, but building
 * Solana transactions is the irreducible core of this use case. Abstracting
 * web3.js behind another port would just create an empty wrapper. The port
 * abstraction is preserved for everything else (RPC calls, swap quoting).
 */
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import type { SolanaClient } from "@/application/ports/solana-client";
import type { SerializedInstruction, SwapQuoter } from "@/application/ports/swap-quoter";
import type { Invoice } from "@/domain/entities/invoice";
import type { Merchant } from "@/domain/entities/merchant";
import { domainError, type DomainError } from "@/domain/errors";
import { err, ok, trySync, type Result } from "@/lib/result";

/** Solana Memo program ID — stable, baked into the runtime. */
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * Hard cap on the transaction's compute budget. Jupiter routes can be
 * compute-heavy; 600k units is plenty for any reasonable swap path.
 */
const COMPUTE_UNIT_LIMIT = 600_000;
/**
 * Priority fee in micro-lamports per compute unit. Boosts our chances of
 * landing during congestion. 10k μlamports * 600k CUs ≈ 6,000 lamports
 * = 0.000006 SOL — negligible at current SOL prices.
 */
const COMPUTE_UNIT_PRICE_MICROLAMPORTS = 10_000;

export type BuildPaymentTransactionInput = {
  readonly invoice: Invoice;
  readonly merchant: Merchant;
  /** Buyer's wallet pubkey, base58. */
  readonly buyerWallet: string;
  /** SPL mint the buyer wants to pay with. */
  readonly inputMint: string;
  /** Slippage cap, in basis points (100 = 1%). Defaults to JUPITER_MAX_SLIPPAGE_BPS. */
  readonly slippageBps: number;
};

export type BuildPaymentTransactionDeps = {
  readonly solana: SolanaClient;
  readonly swap: SwapQuoter;
};

export type BuildPaymentTransactionOutput = {
  /** base64-encoded unsigned VersionedTransaction. */
  readonly transactionBase64: string;
  /** Human-readable summary that wallets can show before signing. */
  readonly message: string;
  /** Quote details for telemetry / UI display. */
  readonly inputAmount: bigint;
  readonly outputAmount: bigint;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Jupiter-style serialized instruction into a web3.js TransactionInstruction. */
function deserializeInstruction(ix: SerializedInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

/** Build the on-chain memo instruction containing the invoice reference. */
function buildMemoInstruction(referenceUtf8: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(referenceUtf8, "utf8"),
  });
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export async function buildPaymentTransaction(
  input: BuildPaymentTransactionInput,
  deps: BuildPaymentTransactionDeps,
): Promise<Result<BuildPaymentTransactionOutput, DomainError>> {
  // 1. Domain sanity checks. The repo + use cases upstream should already
  //    have ensured these, but defense in depth.
  if (input.invoice.status !== "pending") {
    return err(domainError("CONFLICT", `Invoice is ${input.invoice.status}, not pending`));
  }
  if (input.invoice.expiresAt.getTime() <= Date.now()) {
    return err(domainError("EXPIRED", "Invoice has expired"));
  }

  // 2. Parse pubkeys via web3.js — invalid base58 throws synchronously.
  //    We validate the input mint here for early failure, but the actual
  //    web3.js value is not needed; Jupiter takes the mint as a string.
  const parsed = trySync(
    () => ({
      buyer: new PublicKey(input.buyerWallet),
      merchantWallet: new PublicKey(input.merchant.walletAddress),
      _inputMintCheck: new PublicKey(input.inputMint),
      outputMint: new PublicKey(input.merchant.settlementMint),
    }),
    (cause) => domainError("VALIDATION_FAILED", "Invalid pubkey", { cause }),
  );
  if (!parsed.ok) return parsed;
  const { buyer, merchantWallet, outputMint } = parsed.value;

  // 3. Compute the merchant's USDC ATA (deterministic, no RPC call needed).
  const merchantUsdcAtaResult = trySync(
    () => getAssociatedTokenAddressSync(outputMint, merchantWallet, true),
    (cause) => domainError("INTERNAL_ERROR", "Failed to derive merchant ATA", { cause }),
  );
  if (!merchantUsdcAtaResult.ok) return merchantUsdcAtaResult;
  const merchantUsdcAta = merchantUsdcAtaResult.value;

  // 4. Quote: how much of `inputMint` do we need to swap to receive exactly
  //    `invoice.amount.amount` of the settlement token?
  const quoteResult = await deps.swap.quoteExactOut({
    inputMint: input.inputMint,
    outputMint: input.merchant.settlementMint,
    outputAmount: input.invoice.amount.amount,
    slippageBps: input.slippageBps,
  });
  if (!quoteResult.ok) return quoteResult;
  const quote = quoteResult.value;

  // 5. Fetch the actual swap instructions, routed directly to the merchant ATA.
  const instructionsResult = await deps.swap.fetchSwapInstructions({
    quote,
    userPublicKey: input.buyerWallet,
    destinationTokenAccount: merchantUsdcAta.toBase58(),
  });
  if (!instructionsResult.ok) return instructionsResult;
  const swapIx = instructionsResult.value;

  // 6. Fetch the recent blockhash for the v0 message.
  const blockhashResult = await deps.solana.getLatestBlockhash();
  if (!blockhashResult.ok) return blockhashResult;

  // 7. Fetch the address lookup tables Jupiter referenced.
  const altResult = await deps.solana.getAddressLookupTables(swapIx.addressLookupTableAddresses);
  if (!altResult.ok) return altResult;

  // 8. Convert ALTs into web3.js AddressLookupTableAccount objects.
  const altAccountsResult = trySync(
    () =>
      altResult.value.map(
        (table) =>
          new AddressLookupTableAccount({
            key: new PublicKey(table.pubkey),
            state: {
              deactivationSlot: BigInt("18446744073709551615"), // u64::MAX = active
              lastExtendedSlot: 0,
              lastExtendedSlotStartIndex: 0,
              addresses: table.addresses.map((a) => new PublicKey(a)),
            },
          }),
      ),
    (cause) => domainError("UPSTREAM_FAILURE", "Failed to parse ALTs", { cause }),
  );
  if (!altAccountsResult.ok) return altAccountsResult;

  // 9. Compose the instruction list. Order matters: compute budget → ATA
  //    create → Jupiter setup → swap → Jupiter cleanup → memo.
  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: COMPUTE_UNIT_PRICE_MICROLAMPORTS,
    }),
    // Idempotent ATA create — no-op if it already exists. Buyer pays rent.
    createAssociatedTokenAccountIdempotentInstruction(
      buyer,
      merchantUsdcAta,
      merchantWallet,
      outputMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    ...swapIx.setupInstructions.map(deserializeInstruction),
    deserializeInstruction(swapIx.swapInstruction),
    ...swapIx.cleanupInstructions.map(deserializeInstruction),
    buildMemoInstruction(input.invoice.reference),
  ];

  // 10. Compile to a v0 message and serialize.
  const buildResult = trySync(
    () => {
      const message = new TransactionMessage({
        payerKey: buyer,
        recentBlockhash: blockhashResult.value.blockhash,
        instructions,
      }).compileToV0Message(altAccountsResult.value);

      const tx = new VersionedTransaction(message);
      const serialized = tx.serialize();
      // Sanity check: the on-the-wire transaction must fit in the runtime
      // limit. Jupiter + ATA create + memo should comfortably fit with ALTs;
      // if it doesn't, surface a clear error rather than failing at broadcast.
      if (serialized.length > 1232) {
        throw new Error(
          `Transaction size ${String(serialized.length)} exceeds Solana limit of 1232 bytes`,
        );
      }
      return Buffer.from(serialized).toString("base64");
    },
    (cause) =>
      domainError("INTERNAL_ERROR", "Failed to compile or serialize transaction", { cause }),
  );
  if (!buildResult.ok) return buildResult;

  return ok({
    transactionBase64: buildResult.value,
    message: `Pay ${input.merchant.businessName ?? "merchant"}`,
    inputAmount: quote.inputAmount,
    outputAmount: quote.outputAmount,
  });
}
