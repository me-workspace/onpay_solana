/**
 * Solana Pay Transaction Request endpoint.
 *
 * Implements the Solana Pay spec (https://docs.solanapay.com/spec):
 *
 *   GET  /api/tx/[reference]    → returns { label, icon }
 *   POST /api/tx/[reference]    → accepts { account, inputMint? },
 *                                  returns { transaction, message }
 *
 * The buyer's wallet calls these two endpoints in sequence after scanning
 * the QR code:
 *
 *   1. GET to discover the merchant label/icon for the user-facing prompt.
 *   2. POST to fetch the actual unsigned transaction, which the wallet then
 *      shows the user, signs, and broadcasts.
 *
 * Both endpoints are public (no auth) — that's how the Solana Pay protocol
 * works. We rely on the unguessability of the reference key (~191 bits of
 * entropy) for invoice integrity.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildPaymentTransaction } from "@/application/use-cases/build-payment-transaction";
import { publicEnv } from "@/config/env";
import { serverEnv } from "@/config/env.server";
import { isInvoicePayable } from "@/domain/entities/invoice";
import { parseInvoiceReference } from "@/domain/value-objects/reference";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { createJupiterQuoter } from "@/infrastructure/jupiter/quoter";
import { createSolanaClient } from "@/infrastructure/solana/client";
import { apiError } from "@/lib/api-error";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  parseJsonBody,
  withErrorHandler,
} from "@/lib/http";
import { logger } from "@/lib/logger";
import { txRateLimiter } from "@/lib/rate-limit";
import { isWalletSanctioned } from "@/lib/sanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CORS headers required by the Solana Pay spec. Wallet apps (Solflare,
 * Phantom mobile, Backpack) make cross-origin requests from their in-app
 * browsers or native HTTP clients. Without these headers, the browser's
 * same-origin policy blocks the request and the scan silently fails.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/** Preflight handler — wallets send OPTIONS before POST. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------
// GET — return the metadata the wallet shows in the user-facing prompt.
// ---------------------------------------------------------------------------

type GetResponse = {
  readonly label: string;
  readonly icon: string;
};

export const GET = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ reference: string }> }) => {
    enforceRateLimit(txRateLimiter.check(clientKeyFromRequest(req)), "tx/get");
    const { reference: rawReference } = await context.params;
    const referenceResult = parseInvoiceReference(rawReference);
    if (!referenceResult.ok) {
      throw apiError("INVALID_REQUEST", referenceResult.error.message);
    }

    const db = getDb();
    const invoiceRepo = createInvoiceRepository(db);
    const invoiceResult = await invoiceRepo.findByReference(referenceResult.value);
    if (!invoiceResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch invoice");
    }
    if (invoiceResult.value === null) {
      throw apiError("NOT_FOUND", "Invoice not found");
    }

    const merchantRepo = createMerchantRepository(db);
    const merchantResult = await merchantRepo.findById(invoiceResult.value.merchantId);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
    }
    if (merchantResult.value === null) {
      throw apiError("NOT_FOUND", "Merchant not found");
    }

    const response: GetResponse = {
      label: merchantResult.value.businessName ?? "OnPay merchant",
      // Static favicon for the foundation phase. Will be replaced with
      // per-merchant logos in Phase 2.
      icon: `${publicEnv.NEXT_PUBLIC_APP_URL}/favicon.ico`,
    };

    return NextResponse.json(response, { status: 200, headers: CORS_HEADERS });
  },
);

// ---------------------------------------------------------------------------
// POST — build the unsigned transaction.
// ---------------------------------------------------------------------------

const postBodySchema = z.object({
  /** Buyer wallet pubkey, base58. */
  account: z.string().min(32).max(44),
  /**
   * Optional: SPL mint the buyer wants to pay with. Defaults to the
   * merchant's settlement mint (i.e. a no-swap straight transfer through
   * Jupiter, which still validates the route).
   */
  inputMint: z.string().min(32).max(44).optional(),
});

type PostResponse = {
  readonly transaction: string;
  readonly message: string;
};

export const POST = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ reference: string }> }) => {
    enforceRateLimit(txRateLimiter.check(clientKeyFromRequest(req)), "tx/post");
    const { reference: rawReference } = await context.params;
    const referenceResult = parseInvoiceReference(rawReference);
    if (!referenceResult.ok) {
      throw apiError("INVALID_REQUEST", referenceResult.error.message);
    }

    const body = await parseJsonBody(req, postBodySchema);
    const log = logger.child({
      route: "POST /api/tx/[reference]",
      reference: referenceResult.value,
    });

    // 0. OFAC sanctions screening — block before building any transaction.
    if (isWalletSanctioned(body.account)) {
      log.warn({ buyerWallet: body.account }, "BLOCKED: buyer wallet is on OFAC sanctions list");
      throw apiError(
        "FORBIDDEN",
        "This wallet address is restricted and cannot make payments through OnPay.",
      );
    }

    // 1. Load the invoice.
    const db = getDb();
    const invoiceRepo = createInvoiceRepository(db);
    const invoiceResult = await invoiceRepo.findByReference(referenceResult.value);
    if (!invoiceResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch invoice");
    }
    const invoice = invoiceResult.value;
    if (invoice === null) {
      throw apiError("NOT_FOUND", "Invoice not found");
    }

    // 2. Sanity-check lifecycle. We could let the use case do this, but
    //    returning the right HTTP status here makes the wallet's UX better.
    if (!isInvoicePayable(invoice, new Date())) {
      if (invoice.status === "paid") {
        throw apiError("CONFLICT", "Invoice has already been paid");
      }
      throw apiError("GONE", "Invoice has expired or is no longer payable");
    }

    // 3. Load the merchant.
    const merchantRepo = createMerchantRepository(db);
    const merchantResult = await merchantRepo.findById(invoice.merchantId);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
    }
    const merchant = merchantResult.value;
    if (merchant === null) {
      throw apiError("NOT_FOUND", "Merchant not found");
    }

    // 4. Build the transaction via the use case. If a fee payer is configured,
    //    pass its private key so the use case can partially sign.
    const inputMint = body.inputMint ?? merchant.settlementMint;
    const txResult = await buildPaymentTransaction(
      {
        invoice,
        merchant,
        buyerWallet: body.account,
        inputMint,
        slippageBps: serverEnv.JUPITER_MAX_SLIPPAGE_BPS,
        ...(serverEnv.FEE_PAYER_PRIVATE_KEY !== undefined
          ? { feePayerPrivateKey: serverEnv.FEE_PAYER_PRIVATE_KEY }
          : {}),
      },
      {
        solana: createSolanaClient(),
        swap: createJupiterQuoter(),
      },
    );

    if (!txResult.ok) {
      log.warn(
        { kind: txResult.error.kind, message: txResult.error.message },
        "failed to build payment transaction",
      );
      const kind = txResult.error.kind;
      switch (kind) {
        case "VALIDATION_FAILED":
          throw apiError("INVALID_REQUEST", txResult.error.message);
        case "EXPIRED":
          throw apiError("GONE", txResult.error.message);
        case "CONFLICT":
          throw apiError("CONFLICT", txResult.error.message);
        case "UPSTREAM_FAILURE":
          throw apiError("UPSTREAM_FAILURE", "Failed to build transaction with Jupiter");
        case "UNAUTHORIZED":
        case "FORBIDDEN":
        case "NOT_FOUND":
        case "RATE_LIMITED":
        case "INTERNAL_ERROR":
          throw apiError("INTERNAL_ERROR", "Failed to build transaction");
      }
    }

    log.info(
      {
        inputAmount: txResult.value.inputAmount.toString(),
        outputAmount: txResult.value.outputAmount.toString(),
        feePayerEnabled: serverEnv.FEE_PAYER_PRIVATE_KEY !== undefined,
      },
      "built payment transaction",
    );

    // Check fee payer balance and log warning if running low.
    // This is async but non-blocking — we don't wait for it, and failures
    // are swallowed. The tx has already been built; this is purely ops alerting.
    if (serverEnv.FEE_PAYER_PRIVATE_KEY !== undefined) {
      const solanaClient = createSolanaClient();
      void solanaClient.getFeePagerBalance(serverEnv.FEE_PAYER_PRIVATE_KEY).then((result) => {
        if (result.ok && result.value < 100_000_000) {
          // < 0.1 SOL
          log.warn(
            { balanceLamports: result.value },
            "fee payer balance is low — top up the hot wallet soon",
          );
        }
      });
    }

    const response: PostResponse = {
      transaction: txResult.value.transactionBase64,
      message: txResult.value.message,
    };

    return NextResponse.json(response, { status: 200, headers: CORS_HEADERS });
  },
);
