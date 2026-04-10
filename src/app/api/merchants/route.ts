/**
 * POST /api/merchants — upsert a merchant by wallet address.
 *
 * Called when a merchant connects their wallet to OnPay for the first time,
 * or updates their profile. Idempotent: calling with the same wallet address
 * returns the existing merchant with any non-null fields updated.
 *
 * NOTE: This endpoint does NOT verify that the caller actually owns the
 * wallet they claim. Wallet-signature verification is a separate iteration
 * (Week 2 of PLAN.md). For the foundation phase, we accept the trust model
 * that anyone can register any merchant — the worst case is they create a
 * profile pointing payments at someone else's wallet, which is harmless
 * because non-custodial means the funds always go to that wallet anyway.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { upsertMerchant } from "@/application/use-cases/upsert-merchant";
import { serverEnv } from "@/config/env.server";
import type { Merchant } from "@/domain/entities/merchant";
import { getDb } from "@/infrastructure/db/client";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { apiError } from "@/lib/api-error";
import { parseJsonBody, withErrorHandler } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  walletAddress: z.string().min(32).max(44),
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

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req, upsertSchema);

  const result = await upsertMerchant(
    {
      walletAddress: body.walletAddress,
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
