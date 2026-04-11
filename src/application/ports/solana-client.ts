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

/**
 * A signature that references the queried address. Returned by
 * `findSignaturesForReference`. Only confirmed-or-finalized transactions
 * are returned; pending or unconfirmed ones are filtered out by the
 * infrastructure adapter.
 */
export type ReferenceSignature = {
  readonly signature: string;
  readonly slot: number;
  readonly blockTime: number | null;
  /** Non-null if the transaction failed on-chain; null means success. */
  readonly err: unknown;
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

  /**
   * Find all confirmed/finalized signatures that mention the given
   * reference pubkey as an account. Used by the payment confirmation
   * loop — when we generate an invoice, we embed a random pubkey as its
   * reference and include it as an account key in the payment tx's memo
   * instruction. This call then answers "has anyone paid this invoice?"
   *
   * `limit` caps the number of signatures returned (default 10).
   * Failed or dropped transactions are filtered out so callers only see
   * real payments.
   */
  findSignaturesForReference(
    reference: string,
    limit?: number,
  ): Promise<Result<readonly ReferenceSignature[], DomainError>>;

  /** Best-effort health check: returns ok if the RPC responds within a reasonable timeout. */
  checkHealth(): Promise<Result<true, DomainError>>;
};
