/**
 * Invoice entity — represents a single payment request created by a merchant.
 *
 * An invoice has a lifecycle:
 *   pending → paid        (buyer signed and the swap+transfer confirmed)
 *   pending → expired     (TTL elapsed without payment)
 *   pending → failed      (buyer attempted payment but it errored)
 *
 * The reference field is a 32-character unguessable ID that's embedded in
 * the Solana Pay URL. It's the primary correlation key between off-chain
 * state (Supabase) and on-chain events (Jupiter swap + SPL transfer).
 */
import type { Money } from "../value-objects/money";
import type { InvoiceReference } from "../value-objects/reference";
import type { MerchantId } from "./merchant";

export type InvoiceId = string & { readonly __brand: "InvoiceId" };

export type InvoiceStatus = "pending" | "paid" | "expired" | "failed";

export type Invoice = {
  readonly id: InvoiceId;
  readonly merchantId: MerchantId;
  readonly reference: InvoiceReference;
  readonly amount: Money;
  readonly label: string | null;
  readonly memo: string | null;
  readonly status: InvoiceStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
};

/** Pure predicate: is this invoice still payable as of the given clock time? */
export function isInvoicePayable(invoice: Invoice, now: Date): boolean {
  return invoice.status === "pending" && invoice.expiresAt.getTime() > now.getTime();
}
