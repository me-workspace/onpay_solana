/**
 * Invoice Reference — a cryptographically random identifier attached to every
 * invoice, used to correlate on-chain payments with off-chain invoice records.
 *
 * For OnPay, the reference is a base58-encoded Solana public key (32 bytes).
 * This is deliberate: by including the reference as a non-signer account key
 * in the payment transaction's memo instruction, we can later locate all
 * signatures that paid this invoice via `getSignaturesForAddress(ref)` on
 * any Solana RPC. That's how the payment confirmation loop closes without
 * any off-chain webhook infrastructure.
 *
 * The reference is unguessable because it's randomly generated (ed25519
 * keypair) — ~256 bits of entropy, same as a Solana wallet address. No
 * attacker can pre-compute or scan for valid references.
 *
 * NOTE: Actual generation lives in `src/lib/solana-pubkey.ts` to keep the
 * domain layer free of `@solana/web3.js` imports. This module only defines
 * the branded type and the untrusted-input parser.
 */
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

import type { DomainError } from "../errors";
import { domainError } from "../errors";

/** Branded type so references can't be confused with arbitrary strings. */
export type InvoiceReference = string & { readonly __brand: "InvoiceReference" };

/**
 * Base58 alphabet (Bitcoin/Solana convention): 1-9, A-H, J-N, P-Z, a-k, m-z.
 * Excludes 0, O, I, l to avoid visual confusion.
 */
const BASE58_PUBKEY_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Parse an untrusted string into an InvoiceReference.
 * Validates base58 pubkey shape (32-44 chars, base58 alphabet). Does NOT
 * verify the curve point — that happens inside web3.js when we actually
 * use the value to build a transaction.
 */
export function parseInvoiceReference(input: string): Result<InvoiceReference, DomainError> {
  const trimmed = input.trim();
  if (!BASE58_PUBKEY_REGEX.test(trimmed)) {
    return err(
      domainError("VALIDATION_FAILED", "Invoice reference must be a base58-encoded Solana pubkey"),
    );
  }
  return ok(trimmed as InvoiceReference);
}
