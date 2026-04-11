/**
 * Solana pubkey helpers.
 *
 * Lives in `lib/` because it has a concrete dependency on `@solana/web3.js`,
 * which we don't want leaking into the domain layer. The application layer
 * consumes this module through small dependency-injected helpers so unit
 * tests can substitute deterministic fakes.
 */
import { Keypair } from "@solana/web3.js";

import type { InvoiceReference } from "@/domain/value-objects/reference";

/**
 * Generate a fresh invoice reference — a random base58-encoded Solana
 * pubkey. We discard the private key; the reference is never signed with.
 * It's used purely as an on-chain correlation marker: we include it as a
 * non-signer account in the payment transaction's memo instruction, then
 * later call `getSignaturesForAddress(ref)` to find payments that cited it.
 */
export function generateInvoiceReference(): InvoiceReference {
  return Keypair.generate().publicKey.toBase58() as InvoiceReference;
}
