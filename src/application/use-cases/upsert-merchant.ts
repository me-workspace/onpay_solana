/**
 * Use case: Upsert Merchant.
 *
 * Called when a merchant connects their wallet for the first time, or
 * updates their profile. The wallet address is the primary identifier;
 * everything else is editable.
 *
 * Validation lives here, not in the repo, because validation is a domain
 * concern. The repo just persists.
 */
import type { Merchant } from "@/domain/entities/merchant";
import { domainError, type DomainError } from "@/domain/errors";
import { parseWalletAddress } from "@/domain/value-objects/wallet-address";
import type { Result } from "@/lib/result";
import { err } from "@/lib/result";

import type { MerchantRepository } from "../ports/merchant-repo";

export type UpsertMerchantInput = {
  readonly walletAddress: string;
  readonly businessName: string | null;
  readonly settlementMint: string;
  readonly preferredLanguage: "en" | "id";
};

export type UpsertMerchantDeps = {
  readonly merchants: MerchantRepository;
};

export async function upsertMerchant(
  input: UpsertMerchantInput,
  deps: UpsertMerchantDeps,
): Promise<Result<Merchant, DomainError>> {
  // 1. Validate the wallet address (returns Err if shape is wrong).
  const walletResult = parseWalletAddress(input.walletAddress);
  if (!walletResult.ok) return walletResult;

  // 2. Sanity-check the business name length.
  if (input.businessName !== null && input.businessName.length > 200) {
    return err(domainError("VALIDATION_FAILED", "Business name is too long (max 200)"));
  }

  // 3. Sanity-check the settlement mint shape (base58, 32-44 chars).
  if (input.settlementMint.length < 32 || input.settlementMint.length > 44) {
    return err(domainError("VALIDATION_FAILED", "Invalid settlement mint address"));
  }

  // 4. Persist via the repository — repo errors propagate.
  return deps.merchants.upsert({
    walletAddress: walletResult.value,
    businessName: input.businessName,
    settlementMint: input.settlementMint,
    preferredLanguage: input.preferredLanguage,
  });
}
