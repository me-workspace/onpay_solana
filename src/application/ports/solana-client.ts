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

/**
 * Minimal AddressLookupTable shape — pubkey + the list of addresses it holds.
 * Returned by `getAddressLookupTables`. The transaction builder uses these
 * directly when compiling a v0 message.
 */
export type AddressLookupTable = {
  readonly pubkey: string;
  readonly addresses: readonly string[];
};

export type SolanaClient = {
  /** Returns the latest finalized blockhash, used as the "recent" blockhash in new transactions. */
  getLatestBlockhash(): Promise<
    Result<{ blockhash: string; lastValidBlockHeight: number }, DomainError>
  >;

  /**
   * Look up Address Lookup Tables by pubkey. Used when building a v0
   * VersionedTransaction so the swap+transfer composition fits in 1232 bytes.
   * Missing tables are silently dropped — Solana RPC returns null for
   * non-existent accounts.
   */
  getAddressLookupTables(
    pubkeys: readonly string[],
  ): Promise<Result<readonly AddressLookupTable[], DomainError>>;

  /** Best-effort health check: returns ok if the RPC responds within a reasonable timeout. */
  checkHealth(): Promise<Result<true, DomainError>>;
};
