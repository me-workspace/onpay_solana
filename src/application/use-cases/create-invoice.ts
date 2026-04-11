/**
 * Use case: Create Invoice.
 *
 * Takes a merchant and an amount in a display currency (e.g. USD), generates
 * a fresh reference, and persists a new `pending` invoice with a TTL. This
 * function is pure in the sense that it has no global state — all
 * dependencies are injected via the input object, making it trivially unit
 * testable.
 *
 * The amount is validated at the domain boundary. The reference is
 * cryptographically random (32 chars ≈ 191 bits of entropy). Expiry is
 * computed from a clock dependency so tests can freeze time.
 *
 * Returns a `Result<Invoice, DomainError>` — the caller must handle failure.
 */
import type { Invoice } from "@/domain/entities/invoice";
import type { Merchant } from "@/domain/entities/merchant";
import type { DomainError } from "@/domain/errors";
import { domainError } from "@/domain/errors";
import { moneyFromDecimal } from "@/domain/value-objects/money";
import type { InvoiceReference } from "@/domain/value-objects/reference";
import { flatMap, type Result } from "@/lib/result";

import type { Clock } from "../ports/clock";
import type { InvoiceRepository } from "../ports/invoice-repo";

export type CreateInvoiceInput = {
  readonly merchant: Merchant;
  /** User-entered amount as a decimal string, e.g. "4.00" or "10.5". */
  readonly amountDecimal: string;
  /** ISO currency code for the display amount, e.g. "USD", "IDR". */
  readonly currency: string;
  /** Number of decimal places the currency supports (USD = 2). */
  readonly decimals: number;
  readonly label: string | null;
  readonly memo: string | null;
  /** TTL in seconds; overrides the config default if provided. */
  readonly ttlSeconds: number;
};

export type CreateInvoiceDeps = {
  readonly invoices: InvoiceRepository;
  readonly clock: Clock;
  /**
   * Generates a fresh invoice reference. Injected rather than imported
   * directly from `@/lib/solana-pubkey` so unit tests can provide a
   * deterministic fake without pulling in `@solana/web3.js`.
   */
  readonly generateReference: () => InvoiceReference;
};

export async function createInvoice(
  input: CreateInvoiceInput,
  deps: CreateInvoiceDeps,
): Promise<Result<Invoice, DomainError>> {
  // 1. Validate the amount using the Money value object.
  const amountResult = moneyFromDecimal(input.amountDecimal, input.currency, input.decimals);
  if (!amountResult.ok) return amountResult;

  // 2. Reject zero amounts — a $0 invoice is a bug, not a valid payment.
  if (amountResult.value.amount === 0n) {
    return {
      ok: false,
      error: domainError("VALIDATION_FAILED", "Invoice amount must be greater than zero"),
    };
  }

  // 3. Validate TTL sanity.
  if (!Number.isFinite(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 86_400) {
    return {
      ok: false,
      error: domainError("VALIDATION_FAILED", "Invoice TTL must be between 60 and 86400 seconds"),
    };
  }

  // 4. Sanitize free-form label/memo lengths.
  if (input.label !== null && input.label.length > 200) {
    return {
      ok: false,
      error: domainError("VALIDATION_FAILED", "Invoice label is too long (max 200)"),
    };
  }
  if (input.memo !== null && input.memo.length > 500) {
    return {
      ok: false,
      error: domainError("VALIDATION_FAILED", "Invoice memo is too long (max 500)"),
    };
  }

  // 5. Generate reference + compute expiry.
  const reference = deps.generateReference();
  const expiresAt = new Date(deps.clock.now().getTime() + input.ttlSeconds * 1000);

  // 6. Persist — let the repo Result propagate.
  return flatMap(
    await deps.invoices.create({
      merchantId: input.merchant.id,
      reference,
      amount: amountResult.value,
      label: input.label,
      memo: input.memo,
      expiresAt,
    }),
    (invoice) => ({ ok: true, value: invoice }),
  );
}
