/**
 * API key management endpoints.
 *
 * GET  /api/keys — list all API keys for the authenticated merchant.
 * POST /api/keys — create a new API key. Returns the raw key ONCE.
 *
 * Both endpoints require session cookie auth (wallet sign-in). API key
 * auth is intentionally NOT allowed here — you shouldn't be able to
 * create or list keys using another key.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/infrastructure/db/client";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { apiKeys } from "@/infrastructure/db/schema";
import { apiError } from "@/lib/api-error";
import { generateApiKey } from "@/lib/api-keys";
import { requireAuthenticatedWallet } from "@/lib/auth";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  parseJsonBody,
  withErrorHandler,
} from "@/lib/http";
import { mutationRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Shape returned for each key in list responses. Never includes raw key or hash. */
type ApiKeyResponse = {
  readonly id: string;
  readonly name: string;
  readonly keyType: "publishable" | "secret";
  readonly keyPrefix: string;
  readonly keyHint: string;
  readonly mode: "live" | "test";
  readonly scopes: readonly string[];
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
};

// ---------------------------------------------------------------------------
// GET — list API keys for the authenticated merchant (session auth only).
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "keys/list");
  const authenticatedWallet = await requireAuthenticatedWallet(req);

  const db = getDb();
  const merchantRepo = createMerchantRepository(db);
  const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
  if (!merchantResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
  }
  if (merchantResult.value === null) {
    return NextResponse.json({ keys: [] }, { status: 200 });
  }

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyType: apiKeys.keyType,
      keyPrefix: apiKeys.keyPrefix,
      keyHint: apiKeys.keyHint,
      mode: apiKeys.mode,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.merchantId, merchantResult.value.id))
    .orderBy(apiKeys.createdAt);

  const keys: ApiKeyResponse[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyType: row.keyType,
    keyPrefix: row.keyPrefix,
    keyHint: row.keyHint,
    mode: row.mode,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ keys }, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST — create a new API key. Returns the raw key ONCE.
// ---------------------------------------------------------------------------

/** Maximum number of active (non-revoked) keys per merchant. */
const MAX_KEYS_PER_MERCHANT = 20;

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  keyType: z.enum(["publishable", "secret"]),
  mode: z.enum(["live", "test"]),
  scopes: z.array(z.string().min(1).max(50)).max(20).optional().default([]),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "keys/create");
  const authenticatedWallet = await requireAuthenticatedWallet(req);
  const body = await parseJsonBody(req, createApiKeySchema);

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

  // Enforce per-merchant key limit to prevent abuse.
  const existingKeys = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.merchantId, merchant.id));

  if (existingKeys.length >= MAX_KEYS_PER_MERCHANT) {
    throw apiError(
      "INVALID_REQUEST",
      `Maximum of ${String(MAX_KEYS_PER_MERCHANT)} API keys per merchant. Revoke unused keys first.`,
    );
  }

  // Generate the key.
  const generated = generateApiKey(body.keyType, body.mode);

  // Insert into database.
  const inserted = await db
    .insert(apiKeys)
    .values({
      merchantId: merchant.id,
      name: body.name,
      keyType: body.keyType,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      keyHint: generated.hint,
      mode: body.mode,
      scopes: body.scopes,
    })
    .returning({
      id: apiKeys.id,
      createdAt: apiKeys.createdAt,
    });

  const row = inserted[0];
  if (row === undefined) {
    throw apiError("INTERNAL_ERROR", "Failed to create API key");
  }

  // Return the raw key ONCE — this is the only time it's visible.
  return NextResponse.json(
    {
      id: row.id,
      name: body.name,
      keyType: body.keyType,
      keyPrefix: generated.prefix,
      keyHint: generated.hint,
      mode: body.mode,
      scopes: body.scopes,
      createdAt: row.createdAt.toISOString(),
      /** The full raw key — store this securely; it cannot be retrieved again. */
      rawKey: generated.raw,
    },
    { status: 201 },
  );
});
