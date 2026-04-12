/**
 * GET /api/pay/[reference] — public invoice lookup by reference.
 *
 * This endpoint is unauthenticated and used by the buyer-facing checkout
 * page to poll for invoice status updates. It returns a subset of invoice
 * fields (no merchantId) and triggers the on-chain confirmation check for
 * pending invoices.
 *
 * Rate-limited with `txRateLimiter` since it's public-facing and could
 * be hit by anyone with the checkout link.
 */
import { NextResponse, type NextRequest } from "next/server";

import { systemClock } from "@/application/ports/clock";
import { confirmInvoice } from "@/application/use-cases/confirm-invoice";
import { publicEnv } from "@/config/env";
import type { Invoice } from "@/domain/entities/invoice";
import { formatMoney } from "@/domain/value-objects/money";
import { parseInvoiceReference } from "@/domain/value-objects/reference";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { createPaymentRepository } from "@/infrastructure/db/payment-repo";
import { createSolanaClient } from "@/infrastructure/solana/client";
import { apiError } from "@/lib/api-error";
import { clientKeyFromRequest, enforceRateLimit, withErrorHandler } from "@/lib/http";
import { txRateLimiter } from "@/lib/rate-limit";
import { buildPaymentUrl } from "@/lib/solana-pay-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicInvoiceResponse = {
  readonly id: string;
  readonly reference: string;
  readonly amount: {
    readonly raw: string;
    readonly formatted: string;
    readonly currency: string;
    readonly decimals: number;
  };
  readonly label: string | null;
  readonly memo: string | null;
  readonly status: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly paymentUrl: string;
};

/** Map a domain Invoice to the public response shape (no merchantId). */
function toPublicResponse(invoice: Invoice): PublicInvoiceResponse {
  return {
    id: invoice.id,
    reference: invoice.reference,
    amount: {
      raw: invoice.amount.amount.toString(),
      formatted: formatMoney(invoice.amount),
      currency: invoice.amount.currency,
      decimals: invoice.amount.decimals,
    },
    label: invoice.label,
    memo: invoice.memo,
    status: invoice.status,
    expiresAt: invoice.expiresAt.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    paymentUrl: buildPaymentUrl({
      baseUrl: publicEnv.NEXT_PUBLIC_APP_URL,
      reference: invoice.reference,
      label: invoice.label ?? undefined,
      message: invoice.memo ?? undefined,
    }),
  };
}

export const GET = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ reference: string }> }) => {
    enforceRateLimit(txRateLimiter.check(clientKeyFromRequest(req)), "pay/reference");

    const { reference: rawRef } = await context.params;
    const parsed = parseInvoiceReference(rawRef);
    if (!parsed.ok) {
      throw apiError("INVALID_REQUEST", "Invalid invoice reference");
    }

    const db = getDb();
    const invoiceRepo = createInvoiceRepository(db);
    const paymentRepo = createPaymentRepository(db);
    const fetched = await invoiceRepo.findByReference(parsed.value);
    if (!fetched.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch invoice", {
        cause: fetched.error,
      });
    }
    if (fetched.value === null) {
      throw apiError("NOT_FOUND", "Invoice not found");
    }

    // Lazy on-chain confirmation — same pattern as /api/invoices/[id].
    const confirmed = await confirmInvoice(fetched.value, {
      invoices: invoiceRepo,
      payments: paymentRepo,
      solana: createSolanaClient(),
      clock: systemClock,
    });
    if (!confirmed.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to confirm invoice", {
        cause: confirmed.error,
      });
    }

    return NextResponse.json(toPublicResponse(confirmed.value), { status: 200 });
  },
);
