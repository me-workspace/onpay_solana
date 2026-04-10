/**
 * SolanaClient port — narrow abstraction over the subset of Solana RPC
 * operations the application layer needs.
 *
 * Keeping this surface area small makes it easy to swap RPC providers and
 * easy to fake in tests. Only add methods here when a use case actually
 * needs them.
 */
import type { DomainError } from "@/domain/errors";
import type { Result } from "@/lib/result";

export type SolanaClient = {
  /** Returns the latest finalized blockhash, used as the "recent" blockhash in new transactions. */
  getLatestBlockhash(): Promise<
    Result<{ blockhash: string; lastValidBlockHeight: number }, DomainError>
  >;

  /** Best-effort health check: returns ok if the RPC responds within a reasonable timeout. */
  checkHealth(): Promise<Result<true, DomainError>>;
};
