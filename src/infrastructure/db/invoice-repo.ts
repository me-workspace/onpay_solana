/**
 * Drizzle-backed implementation of `InvoiceRepository`.
 *
 * This adapter is the ONLY place in the codebase that knows about the
 * shape of the `invoices` table or the drizzle query API. All domain
 * code consumes the `Invoice` entity; this file maps between database
 * rows and domain types.
 *
 * All methods return `Result<T, DomainError>` so upstream errors
 * surface explicitly to the application layer.
 */
import { and, desc, eq, lt } from "drizzle-orm";

import type {
  CreateInvoiceRepoInput,
  InvoiceRepository,
  ListInvoicesOptions,
} from "@/application/ports/invoice-repo";
import type { Invoice, InvoiceId, InvoiceStatus } from "@/domain/entities/invoice";
import type { MerchantId } from "@/domain/entities/merchant";
import { domainError, type DomainError } from "@/domain/errors";
import type { Money } from "@/domain/value-objects/money";
import type { InvoiceReference } from "@/domain/value-objects/reference";
import { err, ok, tryAsync, type Result } from "@/lib/result";

import type { Database } from "./client";
import { type InvoiceRow, invoices } from "./schema";

const DEFAULT_PAGE_SIZE = 50;

/**
 * Map a raw database row into an Invoice domain entity.
 * Handles the bigint-as-text conversion and constructs the Money value object.
 */
function rowToInvoice(row: InvoiceRow): Invoice {
  const money: Money = {
    amount: BigInt(row.amountRaw),
    currency: row.currency,
    decimals: row.decimals,
  };
  return {
    id: row.id as InvoiceId,
    merchantId: row.merchantId as MerchantId,
    reference: row.reference as InvoiceReference,
    amount: money,
    label: row.label,
    memo: row.memo,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/** Wrap a database operation that may throw into a Result. */
async function runQuery<T>(label: string, fn: () => Promise<T>): Promise<Result<T, DomainError>> {
  const result = await tryAsync(fn(), (cause) => ({ cause }));
  if (result.ok) return ok(result.value);
  return err(
    domainError("UPSTREAM_FAILURE", `Database operation failed: ${label}`, {
      cause: result.error.cause,
    }),
  );
}

export function createInvoiceRepository(db: Database): InvoiceRepository {
  return {
    async findById(id: InvoiceId): Promise<Result<Invoice | null, DomainError>> {
      const result = await runQuery("findInvoiceById", () =>
        db.select().from(invoices).where(eq(invoices.id, id)).limit(1),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      return ok(row !== undefined ? rowToInvoice(row) : null);
    },

    async findByReference(ref: InvoiceReference): Promise<Result<Invoice | null, DomainError>> {
      const result = await runQuery("findInvoiceByReference", () =>
        db.select().from(invoices).where(eq(invoices.reference, ref)).limit(1),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      return ok(row !== undefined ? rowToInvoice(row) : null);
    },

    async listByMerchant(
      merchantId: MerchantId,
      options?: ListInvoicesOptions,
    ): Promise<Result<readonly Invoice[], DomainError>> {
      const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
      const offset = options?.offset ?? 0;
      const statusFilter = options?.status;

      const whereClause =
        statusFilter !== undefined
          ? and(eq(invoices.merchantId, merchantId), eq(invoices.status, statusFilter))
          : eq(invoices.merchantId, merchantId);

      const result = await runQuery("listInvoicesByMerchant", () =>
        db
          .select()
          .from(invoices)
          .where(whereClause)
          .orderBy(desc(invoices.createdAt))
          .limit(limit)
          .offset(offset),
      );
      if (!result.ok) return result;
      return ok(result.value.map(rowToInvoice));
    },

    async create(input: CreateInvoiceRepoInput): Promise<Result<Invoice, DomainError>> {
      const result = await runQuery("createInvoice", () =>
        db
          .insert(invoices)
          .values({
            merchantId: input.merchantId,
            reference: input.reference,
            amountRaw: input.amount.amount.toString(),
            currency: input.amount.currency,
            decimals: input.amount.decimals,
            label: input.label,
            memo: input.memo,
            expiresAt: input.expiresAt,
            status: "pending",
          })
          .returning(),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      if (row === undefined) {
        return err(domainError("UPSTREAM_FAILURE", "Insert returned no row"));
      }
      return ok(rowToInvoice(row));
    },

    async updateStatus(
      id: InvoiceId,
      status: InvoiceStatus,
    ): Promise<Result<Invoice, DomainError>> {
      const result = await runQuery("updateInvoiceStatus", () =>
        db.update(invoices).set({ status }).where(eq(invoices.id, id)).returning(),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      if (row === undefined) {
        return err(domainError("NOT_FOUND", `Invoice ${id} not found`));
      }
      return ok(rowToInvoice(row));
    },

    async expirePendingBefore(before: Date): Promise<Result<number, DomainError>> {
      const result = await runQuery("expirePendingInvoices", () =>
        db
          .update(invoices)
          .set({ status: "expired" })
          .where(and(eq(invoices.status, "pending"), lt(invoices.expiresAt, before)))
          .returning({ id: invoices.id }),
      );
      if (!result.ok) return result;
      return ok(result.value.length);
    },
  };
}
