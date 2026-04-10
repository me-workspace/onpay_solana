/**
 * Supabase-backed implementation of `InvoiceRepository`.
 *
 * This file is the only place in the codebase that knows about the shape of
 * the `invoices` table. All domain code uses the `Invoice` entity; this
 * adapter handles the mapping between the DB row and the domain shape.
 *
 * All methods return Result so infrastructure errors are explicit at the
 * application layer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

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
import { err, ok, type Result } from "@/lib/result";

type InvoiceRow = {
  id: string;
  merchant_id: string;
  reference: string;
  amount_raw: string; // bigint stored as text
  currency: string;
  decimals: number;
  label: string | null;
  memo: string | null;
  status: InvoiceStatus;
  expires_at: string;
  created_at: string;
};

function rowToInvoice(row: InvoiceRow): Invoice {
  const money: Money = {
    amount: BigInt(row.amount_raw),
    currency: row.currency,
    decimals: row.decimals,
  };
  return {
    id: row.id as InvoiceId,
    merchantId: row.merchant_id as MerchantId,
    reference: row.reference as InvoiceReference,
    amount: money,
    label: row.label,
    memo: row.memo,
    status: row.status,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
  };
}

export function createSupabaseInvoiceRepo(client: SupabaseClient): InvoiceRepository {
  const table = client.from("invoices");

  return {
    async findById(id: InvoiceId): Promise<Result<Invoice | null, DomainError>> {
      const { data, error } = await table.select("*").eq("id", id).maybeSingle<InvoiceRow>();
      if (error) {
        return err(domainError("UPSTREAM_FAILURE", "Failed to fetch invoice", { cause: error }));
      }
      return ok(data ? rowToInvoice(data) : null);
    },

    async findByReference(ref: InvoiceReference): Promise<Result<Invoice | null, DomainError>> {
      const { data, error } = await table
        .select("*")
        .eq("reference", ref)
        .maybeSingle<InvoiceRow>();
      if (error) {
        return err(
          domainError("UPSTREAM_FAILURE", "Failed to fetch invoice by reference", { cause: error }),
        );
      }
      return ok(data ? rowToInvoice(data) : null);
    },

    async listByMerchant(
      merchantId: MerchantId,
      options?: ListInvoicesOptions,
    ): Promise<Result<readonly Invoice[], DomainError>> {
      const DEFAULT_PAGE_SIZE = 50;
      let query = table
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false });
      if (options?.status !== undefined) query = query.eq("status", options.status);
      const limit = options?.limit;
      if (limit !== undefined) query = query.limit(limit);
      const offset = options?.offset;
      if (offset !== undefined) {
        const from = offset;
        const pageSize = limit ?? DEFAULT_PAGE_SIZE;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }
      const { data, error } = await query;
      if (error) {
        return err(domainError("UPSTREAM_FAILURE", "Failed to list invoices", { cause: error }));
      }
      const rows = data as InvoiceRow[];
      return ok(rows.map(rowToInvoice));
    },

    async create(input: CreateInvoiceRepoInput): Promise<Result<Invoice, DomainError>> {
      const { data, error } = await table
        .insert({
          merchant_id: input.merchantId,
          reference: input.reference,
          amount_raw: input.amount.amount.toString(),
          currency: input.amount.currency,
          decimals: input.amount.decimals,
          label: input.label,
          memo: input.memo,
          expires_at: input.expiresAt.toISOString(),
          status: "pending" satisfies InvoiceStatus,
        })
        .select()
        .single<InvoiceRow>();
      if (error) {
        return err(domainError("UPSTREAM_FAILURE", "Failed to create invoice", { cause: error }));
      }
      return ok(rowToInvoice(data));
    },

    async updateStatus(id: InvoiceId, status: InvoiceStatus): Promise<Result<Invoice, DomainError>> {
      const { data, error } = await table
        .update({ status })
        .eq("id", id)
        .select()
        .single<InvoiceRow>();
      if (error) {
        return err(domainError("UPSTREAM_FAILURE", "Failed to update invoice status", { cause: error }));
      }
      return ok(rowToInvoice(data));
    },
  };
}
