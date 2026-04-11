/**
 * InvoiceRepository port — persistence abstraction for invoices.
 */
import type { Invoice, InvoiceId, InvoiceStatus } from "@/domain/entities/invoice";
import type { MerchantId } from "@/domain/entities/merchant";
import type { DomainError } from "@/domain/errors";
import type { Money } from "@/domain/value-objects/money";
import type { InvoiceReference } from "@/domain/value-objects/reference";
import type { Result } from "@/lib/result";

export type InvoiceRepository = {
  findById(id: InvoiceId): Promise<Result<Invoice | null, DomainError>>;
  findByReference(ref: InvoiceReference): Promise<Result<Invoice | null, DomainError>>;
  listByMerchant(
    merchantId: MerchantId,
    options?: ListInvoicesOptions,
  ): Promise<Result<readonly Invoice[], DomainError>>;
  create(input: CreateInvoiceRepoInput): Promise<Result<Invoice, DomainError>>;
  updateStatus(id: InvoiceId, status: InvoiceStatus): Promise<Result<Invoice, DomainError>>;
  /**
   * Bulk-mark all pending invoices whose `expires_at` is earlier than `before`
   * as expired. Used by the scheduled expiration sweeper — the lazy check in
   * confirmInvoice handles individually-observed invoices, but stale rows
   * that no one is watching still need cleanup.
   *
   * Returns the count of rows updated.
   */
  expirePendingBefore(before: Date): Promise<Result<number, DomainError>>;
};

export type CreateInvoiceRepoInput = {
  readonly merchantId: MerchantId;
  readonly reference: InvoiceReference;
  readonly amount: Money;
  readonly label: string | null;
  readonly memo: string | null;
  readonly expiresAt: Date;
};

export type ListInvoicesOptions = {
  readonly status?: InvoiceStatus;
  readonly limit?: number;
  readonly offset?: number;
};
