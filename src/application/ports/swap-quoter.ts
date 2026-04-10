/**
 * SwapQuoter port — abstracts the "what does it cost to swap X for Y?"
 * question so that use cases don't depend on Jupiter specifically.
 *
 * In production this is backed by the Jupiter v6 API. In tests we inject a
 * fake that returns deterministic quotes without any network calls.
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
  /** Opaque route/quote identifier to pass to the swap-instruction builder. */
  readonly quoteId: string;
};

export type QuoteRequest = {
  readonly inputMint: string;
  readonly outputMint: string;
  /** Exact output amount to receive (exact-out mode). Base units. */
  readonly outputAmount: bigint;
  readonly slippageBps: number;
};

export type SwapQuoter = {
  quoteExactOut(request: QuoteRequest): Promise<Result<SwapQuote, DomainError>>;
};
