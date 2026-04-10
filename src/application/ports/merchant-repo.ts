/**
 * MerchantRepository port — abstracts persistence of merchants so the
 * application layer does not depend on Supabase or any specific database.
 *
 * Returns `Result` instead of throwing, so infrastructure errors surface
 * explicitly to use cases that must decide what to do about them.
 */
import type { Merchant, MerchantId } from "@/domain/entities/merchant";
import type { DomainError } from "@/domain/errors";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";
import type { Result } from "@/lib/result";

export type MerchantRepository = {
  findById(id: MerchantId): Promise<Result<Merchant | null, DomainError>>;
  findByWallet(wallet: WalletAddress): Promise<Result<Merchant | null, DomainError>>;
  upsert(input: UpsertMerchantInput): Promise<Result<Merchant, DomainError>>;
};

export type UpsertMerchantInput = {
  readonly walletAddress: WalletAddress;
  readonly businessName: string | null;
  readonly settlementMint: string;
  readonly preferredLanguage: "en" | "id";
};
