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
import type { Invoice } from "@/domain/entities/invoice";
import type { MerchantId } from "@/domain/entities/merchant";
import { formatMoney } from "@/domain/value-objects/money";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { qrisCharges } from "@/infrastructure/db/schema";
import { createQrisCharge, isMidtransEnabled } from "@/infrastructure/midtrans/client";
import { apiError } from "@/lib/api-error";
import { requireAuthWithScope } from "@/lib/auth";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  parseJsonBody,
  withErrorHandler,
} from "@/lib/http";
import { withIdempotency } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { mutationRateLimiter } from "@/lib/rate-limit";
import { buildPaymentUrl } from "@/lib/solana-pay-url";
import { generateInvoiceReference } from "@/lib/solana-pubkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Currency definitions. Add entries here as we support new display currencies. */
const SUPPORTED_CURRENCIES: Record<string, { decimals: number }> = {
  USD: { decimals: 2 },
  IDR: { decimals: 0 },
};

/**
 * Body no longer carries the merchant wallet — we take it from the
 * session cookie. Anyone calling this endpoint MUST be authenticated
 * as the wallet they want the invoice credited to.
 */
/** Rejects strings containing HTML-unsafe characters to prevent XSS. */
const noHtmlChars = (val: string | null) => val === null || !/[<>"'&]/.test(val);

const createInvoiceSchema = z.object({
  amountDecimal: z.string().min(1).max(20),
  currency: z.string().min(3).max(8).default("USD"),
  label: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .default(null)
    .refine(noHtmlChars, { message: "Must not contain HTML characters" }),
  memo: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .default(null)
    .refine(noHtmlChars, { message: "Must not contain HTML characters" }),
});

/** Hardcoded USD→IDR rate for MVP. Will be replaced by FX API later. */
const USD_TO_IDR_RATE = 16_000;

type QrisResponseField = {
  readonly qrisUrl: string;
  readonly grossAmountIdr: number;
  readonly status: string;
} | null;

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
  readonly qris?: QrisResponseField;
};

function toResponse(invoice: Invoice, qris?: QrisResponseField): InvoiceResponse {
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
    ...(qris !== undefined ? { qris } : {}),
  };
}

/**
 * Convert an invoice amount to IDR (integer) for QRIS.
 * For USD: multiply the decimal amount by the hardcoded rate.
 * For IDR: use the raw amount directly (decimals is 0).
 */
function toIdrAmount(amountDecimal: string, currency: string): number {
  const parsed = parseFloat(amountDecimal);
  if (Number.isNaN(parsed) || parsed <= 0) return 0;
  if (currency === "IDR") return Math.round(parsed);
  if (currency === "USD") return Math.round(parsed * USD_TO_IDR_RATE);
  return 0;
}

// ---------------------------------------------------------------------------
// GET — list the authenticated merchant's invoices.
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.enum(["pending", "paid", "expired", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type ListResponse = {
  readonly invoices: readonly InvoiceResponse[];
  readonly limit: number;
  readonly offset: number;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "invoices/list");
  const auth = await requireAuthWithScope(req, "invoices:read");

  const queryResult = listQuerySchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    offset: req.nextUrl.searchParams.get("offset") ?? undefined,
  });
  if (!queryResult.success) {
    throw apiError("INVALID_REQUEST", "Invalid list query parameters", {
      details: queryResult.error.flatten(),
    });
  }
  const { status, limit, offset } = queryResult.data;

  const db = getDb();
  const merchantRepo = createMerchantRepository(db);

  // Resolve merchant ID — session auth uses wallet lookup, API key already has it.
  let merchantId: MerchantId;
  if (auth.method === "session") {
    const merchantResult = await merchantRepo.findByWallet(auth.wallet);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
    }
    if (merchantResult.value === null) {
      // No merchant row yet — empty list is the correct answer, not 404.
      return NextResponse.json({ invoices: [], limit, offset } satisfies ListResponse, {
        status: 200,
      });
    }
    merchantId = merchantResult.value.id;
  } else {
    merchantId = auth.merchantId;
  }

  const invoiceRepo = createInvoiceRepository(db);
  const listResult = await invoiceRepo.listByMerchant(merchantId, {
    ...(status !== undefined ? { status } : {}),
    limit,
    offset,
  });
  if (!listResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to list invoices");
  }

  const response: ListResponse = {
    invoices: listResult.value.map((inv) => toResponse(inv)),
    limit,
    offset,
  };
  return NextResponse.json(response, { status: 200 });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "invoices/create");
  const auth = await requireAuthWithScope(req, "invoices:write");
  const body = await parseJsonBody(req, createInvoiceSchema);

  // 1. Validate currency.
  const currencyKey = body.currency.toUpperCase();
  const currencyConfig = SUPPORTED_CURRENCIES[currencyKey];
  if (currencyConfig === undefined) {
    throw apiError("INVALID_REQUEST", `Unsupported currency: ${currencyKey}`);
  }

  // 2. Look up the merchant — session auth uses wallet, API key has merchantId.
  const db = getDb();
  const merchantRepo = createMerchantRepository(db);

  let merchant;
  if (auth.method === "session") {
    const merchantResult = await merchantRepo.findByWallet(auth.wallet);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant", {
        cause: merchantResult.error,
      });
    }
    if (merchantResult.value === null) {
      throw apiError("NOT_FOUND", "Merchant not registered. Call POST /api/merchants first.");
    }
    merchant = merchantResult.value;
  } else {
    const merchantResult = await merchantRepo.findById(auth.merchantId);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant", {
        cause: merchantResult.error,
      });
    }
    if (merchantResult.value === null) {
      throw apiError("NOT_FOUND", "Merchant not found for this API key.");
    }
    merchant = merchantResult.value;
  }

  // 3. Create the invoice via the use case, wrapped in idempotency.
  return withIdempotency(req, merchant.id, db, async () => {
    const invoiceRepo = createInvoiceRepository(db);
    const invoiceResult = await createInvoice(
      {
        merchant,
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

    const invoice = invoiceResult.value;

    // 4. Best-effort QRIS charge creation (if Midtrans is configured).
    let qrisField: QrisResponseField | undefined;
    if (isMidtransEnabled() && (currencyKey === "USD" || currencyKey === "IDR")) {
      const qrisLog = logger.child({ invoiceId: invoice.id });
      try {
        const idrAmount = toIdrAmount(body.amountDecimal, currencyKey);
        if (idrAmount > 0) {
          const midtransOrderId = `${invoice.id}_qris_${String(Date.now())}`;
          const charge = await createQrisCharge({
            orderId: midtransOrderId,
            grossAmount: idrAmount,
          });

          // Store the QRIS charge in the database.
          await db.insert(qrisCharges).values({
            invoiceId: invoice.id,
            midtransOrderId,
            midtransTransactionId: charge.transactionId,
            qrisUrl: charge.qrisUrl,
            grossAmount: idrAmount,
            status: charge.transactionStatus,
          });

          qrisField = {
            qrisUrl: charge.qrisUrl,
            grossAmountIdr: idrAmount,
            status: charge.transactionStatus,
          };

          qrisLog.info({ midtransOrderId, idrAmount }, "QRIS charge created for invoice");
        }
      } catch (qrisErr: unknown) {
        // QRIS is best-effort — crypto QR still works.
        qrisLog.warn({ err: qrisErr }, "QRIS charge creation failed (non-fatal)");
      }
    }

    return NextResponse.json(toResponse(invoice, qrisField), { status: 201 });
  });
});
