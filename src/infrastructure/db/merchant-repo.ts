/**
 * Drizzle-backed implementation of `MerchantRepository`.
 *
 * As with the invoice repo, this is the only place that knows about the
 * shape of the `merchants` table. Domain code consumes the `Merchant` entity.
 */
import { eq } from "drizzle-orm";

import type { MerchantRepository, UpsertMerchantInput } from "@/application/ports/merchant-repo";
import type { Merchant, MerchantId } from "@/domain/entities/merchant";
import { domainError, type DomainError } from "@/domain/errors";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";
import { err, ok, tryAsync, type Result } from "@/lib/result";

import type { Database } from "./client";
import { type MerchantRow, merchants } from "./schema";

function rowToMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id as MerchantId,
    walletAddress: row.walletAddress as WalletAddress,
    businessName: row.businessName,
    settlementMint: row.settlementMint,
    preferredLanguage: row.preferredLanguage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function runQuery<T>(label: string, fn: () => Promise<T>): Promise<Result<T, DomainError>> {
  const result = await tryAsync(fn(), (cause) => ({ cause }));
  if (result.ok) return ok(result.value);
  return err(
    domainError("UPSTREAM_FAILURE", `Database operation failed: ${label}`, {
      cause: result.error.cause,
    }),
  );
}

export function createMerchantRepository(db: Database): MerchantRepository {
  return {
    async findById(id: MerchantId): Promise<Result<Merchant | null, DomainError>> {
      const result = await runQuery("findMerchantById", () =>
        db.select().from(merchants).where(eq(merchants.id, id)).limit(1),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      return ok(row !== undefined ? rowToMerchant(row) : null);
    },

    async findByWallet(wallet: WalletAddress): Promise<Result<Merchant | null, DomainError>> {
      const result = await runQuery("findMerchantByWallet", () =>
        db.select().from(merchants).where(eq(merchants.walletAddress, wallet)).limit(1),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      return ok(row !== undefined ? rowToMerchant(row) : null);
    },

    /**
     * Upsert by wallet address. Updates business name + preferred language
     * + settlement mint if the merchant already exists; inserts otherwise.
     * Always updates `updated_at`.
     */
    async upsert(input: UpsertMerchantInput): Promise<Result<Merchant, DomainError>> {
      const result = await runQuery("upsertMerchant", () =>
        db
          .insert(merchants)
          .values({
            walletAddress: input.walletAddress,
            businessName: input.businessName,
            settlementMint: input.settlementMint,
            preferredLanguage: input.preferredLanguage,
          })
          .onConflictDoUpdate({
            target: merchants.walletAddress,
            set: {
              businessName: input.businessName,
              settlementMint: input.settlementMint,
              preferredLanguage: input.preferredLanguage,
              updatedAt: new Date(),
            },
          })
          .returning(),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      if (row === undefined) {
        return err(domainError("UPSTREAM_FAILURE", "Upsert returned no row"));
      }
      return ok(rowToMerchant(row));
    },
  };
}
