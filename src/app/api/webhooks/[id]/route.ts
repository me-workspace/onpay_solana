/**
 * Single webhook endpoint management.
 *
 * DELETE /api/webhooks/[id]            — delete a webhook endpoint (hard delete, cascades deliveries).
 * GET    /api/webhooks/[id]/deliveries — list recent deliveries for debugging (last 50).
 *
 * Both endpoints require session cookie auth (wallet sign-in).
 */
import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/infrastructure/db/client";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { webhookDeliveries, webhookEndpoints } from "@/infrastructure/db/schema";
import { apiError } from "@/lib/api-error";
import { requireAuthenticatedWallet } from "@/lib/auth";
import { clientKeyFromRequest, enforceRateLimit, withErrorHandler } from "@/lib/http";
import { mutationRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("Webhook endpoint id must be a valid UUID");

// ---------------------------------------------------------------------------
// DELETE — hard delete a webhook endpoint (cascades to deliveries).
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "webhooks/delete");
    const authenticatedWallet = await requireAuthenticatedWallet(req);
    const { id: rawId } = await context.params;
    const idResult = idSchema.safeParse(rawId);
    if (!idResult.success) {
      throw apiError("INVALID_REQUEST", "Invalid webhook endpoint id");
    }
    const endpointId = idResult.data;

    const db = getDb();
    const merchantRepo = createMerchantRepository(db);
    const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
    }
    if (merchantResult.value === null) {
      throw apiError("NOT_FOUND", "Merchant not registered.");
    }

    // Verify the endpoint belongs to this merchant.
    const endpoints = await db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, endpointId),
          eq(webhookEndpoints.merchantId, merchantResult.value.id),
        ),
      )
      .limit(1);

    if (endpoints.length === 0) {
      throw apiError("NOT_FOUND", "Webhook endpoint not found");
    }

    // Hard delete — cascade removes all delivery rows.
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId));

    return NextResponse.json({ ok: true, id: endpointId }, { status: 200 });
  },
);

// ---------------------------------------------------------------------------
// GET — list recent deliveries for debugging (last 50).
// ---------------------------------------------------------------------------

type DeliveryResponse = {
  readonly id: string;
  readonly eventType: string;
  readonly httpStatus: number | null;
  readonly responseBody: string | null;
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
};

export const GET = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "webhooks/deliveries");
    const authenticatedWallet = await requireAuthenticatedWallet(req);
    const { id: rawId } = await context.params;
    const idResult = idSchema.safeParse(rawId);
    if (!idResult.success) {
      throw apiError("INVALID_REQUEST", "Invalid webhook endpoint id");
    }
    const endpointId = idResult.data;

    const db = getDb();
    const merchantRepo = createMerchantRepository(db);
    const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
    if (!merchantResult.ok) {
      throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
    }
    if (merchantResult.value === null) {
      throw apiError("NOT_FOUND", "Merchant not registered.");
    }

    // Verify the endpoint belongs to this merchant.
    const endpoints = await db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, endpointId),
          eq(webhookEndpoints.merchantId, merchantResult.value.id),
        ),
      )
      .limit(1);

    if (endpoints.length === 0) {
      throw apiError("NOT_FOUND", "Webhook endpoint not found");
    }

    const rows = await db
      .select({
        id: webhookDeliveries.id,
        eventType: webhookDeliveries.eventType,
        httpStatus: webhookDeliveries.httpStatus,
        responseBody: webhookDeliveries.responseBody,
        attempts: webhookDeliveries.attempts,
        nextRetryAt: webhookDeliveries.nextRetryAt,
        deliveredAt: webhookDeliveries.deliveredAt,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpointId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(50);

    const deliveries: DeliveryResponse[] = rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      httpStatus: row.httpStatus,
      responseBody: row.responseBody,
      attempts: row.attempts,
      nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ deliveries }, { status: 200 });
  },
);
