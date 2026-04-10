/**
 * SwapQuoter port — abstracts the swap aggregator so that use cases don't
 * depend on Jupiter specifically.
 *
 * Two responsibilities:
 *   1. quoteExactOut — given a desired output amount, find the best route.
 *   2. fetchSwapInstructions — given a quote, return the on-chain instructions
 *      that perform the actual swap.
 *
 * Splitting these is intentional: the use case can decide whether to bail
 * out after the quote (e.g. if slippage is too high) without ever calling
 * the more expensive instructions endpoint.
 */
import type { DomainError } from "@/domain/errors";
import type { Result } from "@/lib/result";

export type SwapQuote = {
  /** The input token mint address (base58). */
  readonly inputMint: string;
  /** The output token mint address (base58). */
  readonly outputMint: string;
  /** Raw input amount the buyer will spend (base units). */
  readonly inputAmount: bigint;
  /** Raw output amount the merchant will receive (base units). */
  readonly outputAmount: bigint;
  /** Slippage in basis points (100 = 1%). */
  readonly slippageBps: number;
  /** Opaque quote payload — passed verbatim to fetchSwapInstructions. */
  readonly opaqueQuote: unknown;
};

export type QuoteRequest = {
  readonly inputMint: string;
  readonly outputMint: string;
  /** Exact output amount to receive (exact-out mode). Base units. */
  readonly outputAmount: bigint;
  readonly slippageBps: number;
};

/**
 * A serialized Solana instruction in the form returned by Jupiter's
 * /swap-instructions endpoint. The runtime translates this into a
 * `TransactionInstruction` from `@solana/web3.js`.
 */
export type SerializedInstructionAccount = {
  readonly pubkey: string;
  readonly isSigner: boolean;
  readonly isWritable: boolean;
};

export type SerializedInstruction = {
  readonly programId: string;
  readonly accounts: readonly SerializedInstructionAccount[];
  /** Base64-encoded instruction data. */
  readonly data: string;
};

export type SwapInstructions = {
  /** Compute budget instructions Jupiter recommends for this route. */
  readonly computeBudgetInstructions: readonly SerializedInstruction[];
  /** ATA creations + SOL wrapping that must run before the swap. */
  readonly setupInstructions: readonly SerializedInstruction[];
  /** The actual swap instruction. Always exactly one. */
  readonly swapInstruction: SerializedInstruction;
  /** ATA closures + SOL unwrapping that must run after the swap. */
  readonly cleanupInstructions: readonly SerializedInstruction[];
  /** Address Lookup Table addresses needed to compile the v0 message. */
  readonly addressLookupTableAddresses: readonly string[];
};

export type FetchInstructionsRequest = {
  readonly quote: SwapQuote;
  /** The buyer's wallet pubkey, base58. Will sign the transaction. */
  readonly userPublicKey: string;
  /**
   * The token account that should receive the swap output. We pass the
   * MERCHANT'S USDC ATA here so the swap output flows directly to them
   * without an additional transfer step. Set to `null` to let Jupiter
   * default to the user's own ATA.
   */
  readonly destinationTokenAccount: string | null;
};

export type SwapQuoter = {
  quoteExactOut(request: QuoteRequest): Promise<Result<SwapQuote, DomainError>>;
  fetchSwapInstructions(
    request: FetchInstructionsRequest,
  ): Promise<Result<SwapInstructions, DomainError>>;
};
