/**
 * Invoice Reference — a cryptographically random identifier attached to every
 * invoice. Used to correlate on-chain payments with off-chain invoice records.
 *
 * The reference is encoded as base58 and is 32 bytes long. This matches the
 * Solana Pay spec's reference field, which is a public key (32 bytes).
 *
 * Why not use the database ID? The reference is published in the QR code and
 * observed by the wallet, so it needs to be unguessable to prevent an attacker
 * from preemptively claiming future invoices or probing for valid references.
 * Database IDs (UUIDs) would also work cryptographically, but using a 32-byte
 * Solana-Pay-compatible reference gives us on-chain indexing as a bonus.
 */
import { nanoid } from "nanoid";

import { domainError, type DomainError } from "@/domain/errors";
import { err, ok, type Result } from "@/lib/result";

/** Branded type so references can't be confused with arbitrary strings. */
export type InvoiceReference = string & { readonly __brand: "InvoiceReference" };

/**
 * Generate a new random invoice reference.
 *
 * Uses nanoid with a URL-safe alphabet. We use 32 chars (≈191 bits of
 * entropy), which is more than enough to make collisions astronomically
 * unlikely and references unguessable.
 */
export function generateInvoiceReference(): InvoiceReference {
  return nanoid(32) as InvoiceReference;
}

/**
 * Parse an untrusted string into an InvoiceReference.
 * Returns an error Result if the string is not a valid reference shape.
 */
export function parseInvoiceReference(input: string): Result<InvoiceReference, DomainError> {
  if (input.length !== 32) {
    return err(domainError("VALIDATION_FAILED", "Invoice reference must be 32 characters"));
  }
  if (!/^[A-Za-z0-9_-]{32}$/.test(input)) {
    return err(domainError("VALIDATION_FAILED", "Invoice reference contains invalid characters"));
  }
  return ok(input as InvoiceReference);
}
