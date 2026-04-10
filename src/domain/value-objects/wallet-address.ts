/**
 * WalletAddress value object — a Solana public key encoded as base58.
 *
 * Solana public keys are 32 bytes. Base58-encoded, they are typically 32-44
 * characters long. We don't do a full cryptographic validation here (that
 * would require pulling in `@solana/web3.js` at the domain layer, which we
 * want to keep dependency-free). Instead we enforce the shape and defer
 * canonical validation to the infrastructure layer that actually uses the
 * value with `@solana/web3.js`.
 */
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

import type { DomainError } from "../errors";
import { domainError } from "../errors";

export type WalletAddress = string & { readonly __brand: "WalletAddress" };

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Parse an untrusted string as a Solana wallet address. */
export function parseWalletAddress(input: string): Result<WalletAddress, DomainError> {
  const trimmed = input.trim();
  if (!BASE58_REGEX.test(trimmed)) {
    return err(domainError("VALIDATION_FAILED", "Invalid Solana wallet address"));
  }
  return ok(trimmed as WalletAddress);
}
