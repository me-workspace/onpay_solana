/**
 * DELETE /api/keys/[id] — revoke (soft-delete) an API key.
 *
 * Session auth only — you cannot revoke a key using an API key.
 * Sets `revokedAt` to now instead of deleting the row, so we can
 * audit key lifecycle and reject future requests with a clear
 * "key revoked" signal rather than "key not found".
 */
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/infrastructure/db/client";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { apiKeys } from "@/infrastructure/db/schema";
import { apiError } from "@/lib/api-error";
import { requireAuthenticatedWallet } from "@/lib/auth";
import { clientKeyFromRequest, enforceRateLimit, withErrorHandler } from "@/lib/http";
import { mutationRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("API key id must be a valid UUID");

export const DELETE = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "keys/revoke");
    const authenticatedWallet = await requireAuthenticatedWallet(req);
    const { id: rawId } = await context.params;

    const idResult = idSchema.safeParse(rawId);
    if (!idResult.success) {
      throw apiError("INVALID_REQUEST", "Invalid API key id");
    }
    const keyId = idResult.data;

    const db = getDb();
    const merchantRepo = createMerchantRepository(db);
    const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
    }
    if (merchantResult.value === null) {
      throw apiError("NOT_FOUND", "Merchant not registered.");
    }

    // Only revoke keys that belong to this merchant and are not already revoked.
    const updated = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.merchantId, merchantResult.value.id),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning({ id: apiKeys.id });

    if (updated.length === 0) {
      throw apiError("NOT_FOUND", "API key not found or already revoked.");
    }

    return NextResponse.json({ ok: true, id: keyId }, { status: 200 });
  },
);
