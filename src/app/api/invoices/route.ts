/**
 * POST /api/invoices — create a new invoice for a merchant.
 *
 * The merchant is identified by wallet address. We look them up (or fail if
 * they don't exist), then defer the rest to the createInvoice use case. The
 * response includes the Solana Pay URL ready for QR rendering.
 *
 * NOTE on auth: same as POST /api/merchants — we don't yet verify wallet
 * ownership. Anyone can create an invoice for any merchant. This is harmless
 * (non-custodial: payments always land in the merchant's wallet), but we
 * still rate-limit aggressively to prevent abuse. Real wallet-signature auth
 * comes in Week 2.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { systemClock } from "@/application/ports/clock";
import { createInvoice } from "@/application/use-cases/create-invoice";
import { publicEnv } from "@/config/env";
import { serverEnv } from "@/config/env.server";
import { generateInvoiceReference } from "@/lib/solana-pubkey";
import type { Invoice } from "@/domain/entities/invoice";
import { parseWalletAddress } from "@/domain/value-objects/wallet-address";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { apiError } from "@/lib/api-error";
import { parseJsonBody, withErrorHandler } from "@/lib/http";
import { formatMoney } from "@/domain/value-objects/money";
import { buildPaymentUrl } from "@/lib/solana-pay-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Currency definitions. Add entries here as we support new display currencies. */
const SUPPORTED_CURRENCIES: Record<string, { decimals: number }> = {
  USD: { decimals: 2 },
  IDR: { decimals: 0 },
};

const createInvoiceSchema = z.object({
  merchantWallet: z.string().min(32).max(44),
  amountDecimal: z.string().min(1).max(20),
  currency: z.string().min(3).max(8).default("USD"),
  label: z.string().max(200).nullable().optional().default(null),
  memo: z.string().max(500).nullable().optional().default(null),
});

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

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req, createInvoiceSchema);

  // 1. Validate currency.
  const currencyKey = body.currency.toUpperCase();
  const currencyConfig = SUPPORTED_CURRENCIES[currencyKey];
  if (currencyConfig === undefined) {
    throw apiError("INVALID_REQUEST", `Unsupported currency: ${currencyKey}`);
  }

  // 2. Validate the merchant wallet.
  const walletResult = parseWalletAddress(body.merchantWallet);
  if (!walletResult.ok) {
    throw apiError("INVALID_REQUEST", walletResult.error.message);
  }

  // 3. Look up the merchant.
  const db = getDb();
  const merchantRepo = createMerchantRepository(db);
  const merchantResult = await merchantRepo.findByWallet(walletResult.value);
  if (!merchantResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to fetch merchant", {
      cause: merchantResult.error,
    });
  }
  if (merchantResult.value === null) {
    throw apiError("NOT_FOUND", "Merchant not registered. Call POST /api/merchants first.");
  }

  // 4. Create the invoice via the use case.
  const invoiceRepo = createInvoiceRepository(db);
  const invoiceResult = await createInvoice(
    {
      merchant: merchantResult.value,
      amountDecimal: body.amountDecimal,
      currency: currencyKey,
      decimals: currencyConfig.decimals,
      label: body.label ?? null,
      memo: body.memo ?? null,
      ttlSeconds: serverEnv.INVOICE_TTL_SECONDS,
    },
    { invoices: invoiceRepo, clock: systemClock, generateReference: generateInvoiceReference },
  );

  if (!invoiceResult.ok) {
    if (invoiceResult.error.kind === "VALIDATION_FAILED") {
      throw apiError("INVALID_REQUEST", invoiceResult.error.message);
    }
    throw apiError("INTERNAL_ERROR", "Failed to create invoice", {
      cause: invoiceResult.error,
    });
  }

  return NextResponse.json(toResponse(invoiceResult.value), { status: 201 });
});
