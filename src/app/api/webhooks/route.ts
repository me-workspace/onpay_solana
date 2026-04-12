/**
 * Webhook endpoint management.
 *
 * GET  /api/webhooks — list all webhook endpoints for the authenticated merchant.
 * POST /api/webhooks — create a new webhook endpoint. Returns the signing secret ONCE.
 *
 * Both endpoints require session cookie auth (wallet sign-in). API key
 * auth is intentionally NOT allowed here — webhook secrets are sensitive
 * configuration that should only be managed through the dashboard.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/infrastructure/db/client";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { webhookEndpoints } from "@/infrastructure/db/schema";
import { apiError } from "@/lib/api-error";
import { requireAuthenticatedWallet } from "@/lib/auth";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  parseJsonBody,
  withErrorHandler,
} from "@/lib/http";
import { mutationRateLimiter } from "@/lib/rate-limit";
import { generateWebhookSecret } from "@/lib/webhook-signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Shape returned for each endpoint in list responses. Never includes the raw secret. */
type WebhookEndpointResponse = {
  readonly id: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: string;
};

// ---------------------------------------------------------------------------
// GET — list webhook endpoints for the authenticated merchant.
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "webhooks/list");
  const authenticatedWallet = await requireAuthenticatedWallet(req);

  const db = getDb();
  const merchantRepo = createMerchantRepository(db);
  const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
  if (!merchantResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
  }
  if (merchantResult.value === null) {
    return NextResponse.json({ endpoints: [] }, { status: 200 });
  }

  const rows = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
      enabled: webhookEndpoints.enabled,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.merchantId, merchantResult.value.id))
    .orderBy(webhookEndpoints.createdAt);

  const endpoints: WebhookEndpointResponse[] = rows.map((row) => ({
    id: row.id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  }));

  return NextResponse.json({ endpoints }, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST — create a new webhook endpoint. Returns the signing secret ONCE.
// ---------------------------------------------------------------------------

/** Maximum number of webhook endpoints per merchant. */
const MAX_ENDPOINTS_PER_MERCHANT = 5;

/** Allowed event types for webhook subscriptions. */
const ALLOWED_EVENTS = ["invoice.paid", "invoice.expired", "invoice.failed"] as const;

const createWebhookEndpointSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("https://"), {
      message: "Webhook URL must use HTTPS",
    }),
  events: z
    .array(z.enum(ALLOWED_EVENTS))
    .min(1, "Must subscribe to at least one event")
    .max(ALLOWED_EVENTS.length),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "webhooks/create");
  const authenticatedWallet = await requireAuthenticatedWallet(req);
  const body = await parseJsonBody(req, createWebhookEndpointSchema);

  const db = getDb();
  const merchantRepo = createMerchantRepository(db);
  const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
  if (!merchantResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to fetch merchant", {
      cause: merchantResult.error,
    });
  }
  if (merchantResult.value === null) {
    throw apiError("NOT_FOUND", "Merchant not registered. Call POST /api/merchants first.");
  }

  const merchant = merchantResult.value;

  // Enforce per-merchant endpoint limit.
  const existing = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.merchantId, merchant.id));

  if (existing.length >= MAX_ENDPOINTS_PER_MERCHANT) {
    throw apiError(
      "INVALID_REQUEST",
      `Maximum of ${String(MAX_ENDPOINTS_PER_MERCHANT)} webhook endpoints per merchant. Delete unused endpoints first.`,
    );
  }

  // Generate the signing secret.
  const secret = generateWebhookSecret();

  // Insert into database.
  const inserted = await db
    .insert(webhookEndpoints)
    .values({
      merchantId: merchant.id,
      url: body.url,
      secret,
      events: [...body.events],
    })
    .returning({
      id: webhookEndpoints.id,
      createdAt: webhookEndpoints.createdAt,
    });

  const row = inserted[0];
  if (row === undefined) {
    throw apiError("INTERNAL_ERROR", "Failed to create webhook endpoint");
  }

  // Return the signing secret ONCE — this is the only time it's visible.
  return NextResponse.json(
    {
      id: row.id,
      url: body.url,
      events: body.events,
      enabled: true,
      createdAt: row.createdAt.toISOString(),
      /** The signing secret — store this securely; it cannot be retrieved again. */
      secret,
    },
    { status: 201 },
  );
});
