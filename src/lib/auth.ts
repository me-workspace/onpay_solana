/**
 * Auth helpers for API routes.
 *
 * Every mutation endpoint that needs to know "who is calling" uses
 * `requireAuthenticatedWallet(req)` at the top of its handler. It returns
 * the wallet address from the session cookie, or throws a typed 401 ApiError
 * that the global error handler converts into a clean JSON response.
 *
 * Verification is stateless — the JWT_SECRET signs the session cookie so a
 * restart does not invalidate active sessions. Expired cookies return 401.
 */
import type { NextRequest } from "next/server";

import { parseWalletAddress } from "@/domain/value-objects/wallet-address";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";

import { apiError } from "./api-error";
import { SESSION_COOKIE_NAME, verifySession } from "./jwt";

/**
 * Read the session cookie, verify it, and return the authenticated wallet.
 * Returns null if there's no cookie, the JWT is invalid, or the wallet in
 * the payload fails shape validation.
 */
export async function getAuthenticatedWallet(req: NextRequest): Promise<WalletAddress | null> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (cookie === undefined) return null;
  const payload = await verifySession(cookie.value);
  if (payload === null) return null;
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
