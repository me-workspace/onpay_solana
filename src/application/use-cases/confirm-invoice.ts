/**
 * Use case: Confirm Invoice.
 *
 * Closes the pending → paid loop WITHOUT any off-chain webhook infrastructure.
 * Called lazily on every `GET /api/invoices/[id]` while the invoice is still
 * pending — we query Solana RPC for signatures that reference the invoice's
 * unique pubkey, and if we find one, flip the invoice to `paid` and insert
 * a Payment row.
 *
 * Why lazy: for a hackathon MVP this is strictly better than a background
 * worker or Helius webhook:
 *   - no public webhook URL required (works on localhost + VPS identically)
 *   - no scheduled job to maintain
 *   - latency matches client polling (the dashboard polls every 2s anyway)
 *   - when no one is watching, no work gets done — optimal resource usage
 *
 * Production could later swap this for a Helius webhook for sub-second
 * latency, but the contract for callers stays the same.
 *
 * Idempotency: we check for an existing Payment row by txHash before
 * inserting, so multiple concurrent polls can't create duplicates.
 */
import type { Invoice } from "@/domain/entities/invoice";
import type { DomainError } from "@/domain/errors";
import { domainError } from "@/domain/errors";
import type { Database } from "@/infrastructure/db/client";
import { err, ok, type Result } from "@/lib/result";

import type { Clock } from "../ports/clock";
import type { InvoiceRepository } from "../ports/invoice-repo";
import type { PaymentRepository } from "../ports/payment-repo";
import type { SolanaClient } from "../ports/solana-client";

export type ConfirmInvoiceDeps = {
  readonly invoices: InvoiceRepository;
  readonly payments: PaymentRepository;
  readonly solana: SolanaClient;
  readonly clock: Clock;
  /** Database instance for webhook dispatch. Optional for backward compat. */
  readonly db?: Database;
};

/**
 * Attempt to confirm a pending invoice by checking on-chain for matching
 * signatures. Always returns the most up-to-date Invoice shape, whether or
 * not confirmation happened this call.
 *
 * Terminal invoices (paid/expired/failed) are returned unchanged.
 * Expired-by-time invoices are marked expired before returning.
 * RPC failures are swallowed — we return the current pending invoice
 * rather than bubble an upstream error up to a polling dashboard.
 */
export async function confirmInvoice(
  invoice: Invoice,
  deps: ConfirmInvoiceDeps,
): Promise<Result<Invoice, DomainError>> {
  // Already terminal — nothing to do.
  if (invoice.status !== "pending") {
    return ok(invoice);
  }

  // Expired by wall clock? Mark expired and return.
  const now = deps.clock.now();
  if (invoice.expiresAt.getTime() <= now.getTime()) {
    const updated = await deps.invoices.updateStatus(invoice.id, "expired");
    // Dispatch webhook event asynchronously (fire-and-forget).
    if (updated.ok && updated.value.status === "expired" && deps.db !== undefined) {
      const { dispatchInvoiceEvent } = await import("@/lib/webhook-delivery");
      dispatchInvoiceEvent(
        deps.db,
        {
          id: updated.value.id,
          merchantId: updated.value.merchantId,
          reference: updated.value.reference,
          status: updated.value.status,
        },
        "invoice.expired",
      );
    }
    return updated;
  }

  // Check the chain for matching signatures.
  const sigResult = await deps.solana.findSignaturesForReference(invoice.reference, 5);
  if (!sigResult.ok) {
    // RPC hiccup — don't fail the caller. Return the pending invoice as-is.
    return ok(invoice);
  }

  if (sigResult.value.length === 0) {
    return ok(invoice);
  }

  // Take the oldest confirmed signature (lowest slot) to be deterministic.
  const oldest = [...sigResult.value].sort((a, b) => a.slot - b.slot)[0];
  if (oldest === undefined) return ok(invoice);

  // Idempotency: if we've already recorded a payment for this txHash, bail.
  const existing = await deps.payments.findByTxHash(oldest.signature);
  if (!existing.ok) return existing;
  if (existing.value !== null) {
    // Already have the payment row; ensure invoice status is paid.
    // (Invoice is guaranteed to still be `pending` because we returned
    // early at the top of this function if it wasn't.)
    const paidResult = await deps.invoices.updateStatus(invoice.id, "paid");
    if (paidResult.ok && paidResult.value.status === "paid" && deps.db !== undefined) {
      const { dispatchInvoiceEvent } = await import("@/lib/webhook-delivery");
      dispatchInvoiceEvent(
        deps.db,
        {
          id: paidResult.value.id,
          merchantId: paidResult.value.merchantId,
          reference: paidResult.value.reference,
          status: paidResult.value.status,
        },
        "invoice.paid",
      );
    }
    return paidResult;
  }

  // Record the payment. We store the output amount from the invoice as the
  // authoritative settlement amount; input amount is unknown from the
  // signature alone (would require parsing the transaction). For MVP the
  // output amount is what matters to the merchant — the full tx breakdown
  // is always visible on Solscan via the tx hash.
  const createResult = await deps.payments.create({
    invoiceId: invoice.id,
    buyerWallet: "",
    inputMint: "",
    inputAmount: 0n,
    outputAmount: invoice.amount.amount,
    txHash: oldest.signature,
  });
  if (!createResult.ok) {
    // Could be a unique-violation race from a concurrent poll. Re-check.
    const raceCheck = await deps.payments.findByTxHash(oldest.signature);
    if (raceCheck.ok && raceCheck.value !== null) {
      return deps.invoices.updateStatus(invoice.id, "paid");
    }
    return err(
      domainError("INTERNAL_ERROR", "Failed to record confirmed payment", {
        cause: createResult.error,
      }),
    );
  }

  const finalResult = await deps.invoices.updateStatus(invoice.id, "paid");
  if (finalResult.ok && finalResult.value.status === "paid" && deps.db !== undefined) {
    const { dispatchInvoiceEvent } = await import("@/lib/webhook-delivery");
    dispatchInvoiceEvent(
      deps.db,
      {
        id: finalResult.value.id,
        merchantId: finalResult.value.merchantId,
        reference: finalResult.value.reference,
        status: finalResult.value.status,
      },
      "invoice.paid",
    );
  }
  return finalResult;
}
