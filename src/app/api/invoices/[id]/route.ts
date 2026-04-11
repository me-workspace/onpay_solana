/**
 * GET /api/invoices/[id] — fetch a single invoice by ID.
 *
 * Used by the merchant dashboard for polling payment status. Returns the
 * full invoice + Solana Pay URL. 404 if not found.
 *
 * Before returning, if the invoice is still `pending` we call the
 * `confirmInvoice` use case, which checks on-chain via getSignaturesForAddress
 * for signatures that reference this invoice. If found, the invoice flips
 * to `paid` and a Payment row is recorded before we respond. This is the
 * payment confirmation loop — no webhooks required.
 *
 * No auth check yet (see notes in /api/merchants and /api/invoices).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { systemClock } from "@/application/ports/clock";
import { confirmInvoice } from "@/application/use-cases/confirm-invoice";
import { publicEnv } from "@/config/env";
import type { Invoice, InvoiceId } from "@/domain/entities/invoice";
import { formatMoney } from "@/domain/value-objects/money";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { createPaymentRepository } from "@/infrastructure/db/payment-repo";
import { createSolanaClient } from "@/infrastructure/solana/client";
import { apiError } from "@/lib/api-error";
import { withErrorHandler } from "@/lib/http";
import { buildPaymentUrl } from "@/lib/solana-pay-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z
  .string()
  .uuid("Invoice id must be a valid UUID")
  .transform((v) => v as InvoiceId);

type InvoiceResponse = {
  readonly id: string;
  readonly reference: string;
  readonly merchantId: string;
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

function toResponse(invoice: Invoice): InvoiceResponse {
  return {
    id: invoice.id,
    reference: invoice.reference,
    merchantId: invoice.merchantId,
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
  async (_req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id: rawId } = await context.params;
    const idResult = idSchema.safeParse(rawId);
    if (!idResult.success) {
      throw apiError("INVALID_REQUEST", "Invalid invoice id");
    }

    const db = getDb();
    const invoiceRepo = createInvoiceRepository(db);
    const paymentRepo = createPaymentRepository(db);
    const fetched = await invoiceRepo.findById(idResult.data);
    if (!fetched.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch invoice", {
        cause: fetched.error,
      });
    }
    if (fetched.value === null) {
      throw apiError("NOT_FOUND", "Invoice not found");
    }

    // Lazy on-chain confirmation. If the invoice is still pending, this
    // will query Solana RPC and may flip the invoice to `paid` and insert
    // a Payment row. On RPC failure the use case returns the current
    // pending invoice unchanged, so the dashboard keeps polling cleanly.
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

    return NextResponse.json(toResponse(confirmed.value), { status: 200 });
  },
);
