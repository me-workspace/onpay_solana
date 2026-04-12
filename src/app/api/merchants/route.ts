/**
 * GET  /api/merchants — return the authenticated merchant's profile.
 * POST /api/merchants — upsert the authenticated merchant's profile.
 *
 * Both endpoints identify the merchant via the session cookie, NOT the
 * request body. This prevents anyone from reading/writing merchant rows
 * for arbitrary wallets they don't control. A client must have already
 * completed the /api/auth/nonce → /api/auth/verify flow to call them.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { upsertMerchant } from "@/application/use-cases/upsert-merchant";
import { serverEnv } from "@/config/env.server";
import type { Merchant } from "@/domain/entities/merchant";
import { getDb } from "@/infrastructure/db/client";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { apiError } from "@/lib/api-error";
import { requireAuthenticatedWallet } from "@/lib/auth";
import { isWalletSanctioned } from "@/lib/sanctions";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  parseJsonBody,
  withErrorHandler,
} from "@/lib/http";
import { mutationRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Body only carries editable profile fields — the wallet address comes
 * from the session, not the request.
 */
const upsertSchema = z.object({
  businessName: z.string().max(200).nullable().optional().default(null),
  settlementMint: z.string().min(32).max(44).optional(),
  preferredLanguage: z.enum(["en", "id"]).optional().default("en"),
});

type MerchantResponse = {
  readonly id: string;
  readonly walletAddress: string;
  readonly businessName: string | null;
  readonly settlementMint: string;
  readonly preferredLanguage: "en" | "id";
  readonly createdAt: string;
  readonly updatedAt: string;
};

function toResponse(merchant: Merchant): MerchantResponse {
  return {
    id: merchant.id,
    walletAddress: merchant.walletAddress,
    businessName: merchant.businessName,
    settlementMint: merchant.settlementMint,
    preferredLanguage: merchant.preferredLanguage,
    createdAt: merchant.createdAt.toISOString(),
    updatedAt: merchant.updatedAt.toISOString(),
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "merchants");
  const authenticatedWallet = await requireAuthenticatedWallet(req);

  if (isWalletSanctioned(authenticatedWallet)) {
    throw apiError("FORBIDDEN", "This wallet address is restricted and cannot use OnPay.");
  }

  const merchantRepo = createMerchantRepository(getDb());
  const result = await merchantRepo.findByWallet(authenticatedWallet);
  if (!result.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
  }
  if (result.value === null) {
    // Session is valid but no merchant row yet — treat as "not registered".
    // Client should POST /api/merchants to create one.
    throw apiError("NOT_FOUND", "Merchant profile not found. Sign in to register.");
  }

  return NextResponse.json(toResponse(result.value), { status: 200 });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "merchants");
  const authenticatedWallet = await requireAuthenticatedWallet(req);

  if (isWalletSanctioned(authenticatedWallet)) {
    throw apiError("FORBIDDEN", "This wallet address is restricted and cannot use OnPay.");
  }

  const body = await parseJsonBody(req, upsertSchema);

  const result = await upsertMerchant(
    {
      walletAddress: authenticatedWallet,
      businessName: body.businessName ?? null,
      settlementMint: body.settlementMint ?? serverEnv.DEFAULT_SETTLEMENT_MINT,
      preferredLanguage: body.preferredLanguage,
    },
    { merchants: createMerchantRepository(getDb()) },
  );

  if (!result.ok) {
    if (result.error.kind === "VALIDATION_FAILED") {
      throw apiError("INVALID_REQUEST", result.error.message);
    }
    throw apiError("INTERNAL_ERROR", "Failed to upsert merchant", {
      cause: result.error,
    });
  }

  return NextResponse.json(toResponse(result.value), { status: 200 });
});
