/**
 * Auth helpers for API routes.
 *
 * Every mutation endpoint that needs to know "who is calling" uses
 * `requireAuthenticatedWallet(req)` at the top of its handler. It returns
 * the wallet address from the session cookie, or throws a typed 401 ApiError
 * that the global error handler converts into a clean JSON response.
 *
 * Session revocation: when a user logs out, their JWT's `jti` is inserted
 * into the `revoked_sessions` table. On every auth check we verify the JTI
 * is not revoked. The table is tiny (one row per explicit logout) and the
 * check is a single primary-key lookup (~0.1ms).
 */
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { parseWalletAddress } from "@/domain/value-objects/wallet-address";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";
import { getDb } from "@/infrastructure/db/client";
import { revokedSessions } from "@/infrastructure/db/schema";

import { apiError } from "./api-error";
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
