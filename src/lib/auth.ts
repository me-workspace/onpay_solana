/**
 * Auth helpers for API routes.
 *
 * Every mutation endpoint that needs to know "who is calling" uses
 * `requireAuthenticatedWallet(req)` at the top of its handler. It returns
 * the wallet address from the session cookie, or throws a typed 401 ApiError
 * that the global error handler converts into a clean JSON response.
 *
 * API key authentication: endpoints that support SDK access can use
 * `requireAuth(req)` which tries session cookie first, then falls back
 * to `Authorization: Bearer <api-key>` header lookup. API key auth
 * returns a merchant ID directly (not a wallet address).
 *
 * Session revocation: when a user logs out, their JWT's `jti` is inserted
 * into the `revoked_sessions` table. On every auth check we verify the JTI
 * is not revoked. The table is tiny (one row per explicit logout) and the
 * check is a single primary-key lookup (~0.1ms).
 */
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import type { MerchantId } from "@/domain/entities/merchant";
import { parseWalletAddress } from "@/domain/value-objects/wallet-address";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";
import { getDb } from "@/infrastructure/db/client";
import { apiKeys, merchants, revokedSessions } from "@/infrastructure/db/schema";
import { logger } from "@/lib/logger";

import { apiError } from "./api-error";
import { hashApiKey } from "./api-keys";
import { SESSION_COOKIE_NAME, verifySession } from "./jwt";

/**
 * Check whether a JWT ID has been explicitly revoked (via logout).
 */
async function isSessionRevoked(jti: string): Promise<boolean> {
  try {
    const rows = await getDb()
      .select({ jti: revokedSessions.jti })
      .from(revokedSessions)
      .where(eq(revokedSessions.jti, jti))
      .limit(1);
    return rows.length > 0;
  } catch {
    // If the revocation check fails (DB down etc.), fail open — we don't
    // want a transient DB error to lock every user out. The JWT itself is
    // still cryptographically verified.
    return false;
  }
}

/**
 * Read the session cookie, verify it, and return the authenticated wallet.
 * Returns null if there's no cookie, the JWT is invalid, revoked, or the
 * wallet in the payload fails shape validation.
 */
export async function getAuthenticatedWallet(req: NextRequest): Promise<WalletAddress | null> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (cookie === undefined) return null;
  const payload = await verifySession(cookie.value);
  if (payload === null) return null;

  // Check revocation list.
  if (await isSessionRevoked(payload.jti)) return null;

  const parsed = parseWalletAddress(payload.wallet);
  if (!parsed.ok) return null;
  return parsed.value;
}

/**
 * Require an authenticated wallet for this request. Throws a 401 ApiError
 * if the caller is not authenticated — `withErrorHandler` converts that
 * into a clean JSON response with code `UNAUTHORIZED`.
 */
export async function requireAuthenticatedWallet(req: NextRequest): Promise<WalletAddress> {
  const wallet = await getAuthenticatedWallet(req);
  if (wallet === null) {
    throw apiError("UNAUTHORIZED", "Authentication required. Connect your wallet and sign in.");
  }
  return wallet;
}

// ---------------------------------------------------------------------------
// API key authentication
// ---------------------------------------------------------------------------

/** Result of successful API key authentication. */
export type ApiKeyAuthResult = {
  readonly merchantId: MerchantId;
  readonly keyId: string;
  readonly mode: "live" | "test";
  readonly scopes: readonly string[];
};

/**
 * Authenticate a request via the `Authorization: Bearer <api-key>` header.
 *
 * Looks up the key hash in the `api_keys` table and validates:
 *   - The key exists and is not revoked
 *   - The key has not expired
 *
 * On success, updates `lastUsedAt` and returns the merchant ID + metadata.
 * Returns null if the header is missing or the key is invalid.
 */
export async function getAuthenticatedMerchantByApiKey(
  req: NextRequest,
): Promise<ApiKeyAuthResult | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader === null) return null;

  // Only support Bearer scheme.
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (match === null) return null;
  const rawKey = match[1];
  if (rawKey === undefined) return null;

  // Must look like one of our key prefixes.
  if (
    !rawKey.startsWith("pk_live_") &&
    !rawKey.startsWith("pk_test_") &&
    !rawKey.startsWith("sk_live_") &&
    !rawKey.startsWith("sk_test_")
  ) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);
  const db = getDb();

  try {
    const rows = await db
      .select({
        id: apiKeys.id,
        merchantId: apiKeys.merchantId,
        mode: apiKeys.mode,
        scopes: apiKeys.scopes,
        revokedAt: apiKeys.revokedAt,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    // Check expiration.
    if (row.expiresAt !== null && row.expiresAt.getTime() < Date.now()) {
      return null;
    }

    // Update lastUsedAt asynchronously — don't block the response.
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .then(() => {
        // noop — fire and forget
      })
      .catch((updateErr: unknown) => {
        logger.warn({ err: updateErr, keyId: row.id }, "failed to update api key lastUsedAt");
      });

    return {
      merchantId: row.merchantId as MerchantId,
      keyId: row.id,
      mode: row.mode,
      scopes: row.scopes,
    };
  } catch (lookupErr: unknown) {
    logger.error({ err: lookupErr }, "api key lookup failed");
    return null;
  }
}

/**
 * Unified auth: tries session cookie first, then API key fallback.
 *
 * Returns a discriminated union so callers know the auth method:
 *   - `{ method: "session", wallet, merchantId }` — cookie auth
 *   - `{ method: "apiKey", merchantId, keyId, mode, scopes }` — API key auth
 *
 * Throws a 401 ApiError if neither method succeeds.
 */
export type AuthResult =
  | { readonly method: "session"; readonly wallet: WalletAddress; readonly merchantId: MerchantId }
  | {
      readonly method: "apiKey";
      readonly merchantId: MerchantId;
      readonly keyId: string;
      readonly mode: "live" | "test";
      readonly scopes: readonly string[];
    };

export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  // 1. Try session cookie first.
  const wallet = await getAuthenticatedWallet(req);
  if (wallet !== null) {
    // Resolve wallet → merchant ID.
    const db = getDb();
    const rows = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.walletAddress, wallet))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw apiError("NOT_FOUND", "Merchant not registered. Call POST /api/merchants first.");
    }
    return { method: "session", wallet, merchantId: row.id as MerchantId };
  }

  // 2. Try API key.
  const apiKeyResult = await getAuthenticatedMerchantByApiKey(req);
  if (apiKeyResult !== null) {
    return {
      method: "apiKey",
      merchantId: apiKeyResult.merchantId,
      keyId: apiKeyResult.keyId,
      mode: apiKeyResult.mode,
      scopes: apiKeyResult.scopes,
    };
  }

  throw apiError("UNAUTHORIZED", "Authentication required. Provide a session cookie or API key.");
}
