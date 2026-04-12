/**
 * POST /api/auth/logout — revoke the session and clear the cookie.
 *
 * Inserts the session JWT's `jti` into the `revoked_sessions` table so that
 * any in-flight requests using the same token are rejected. The table entry
 * is cleaned up by the expiry cron once the JWT's natural expiration passes.
 *
 * Also clears the session cookie via Set-Cookie with maxAge=0.
 */
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/config/env.server";
import { getDb } from "@/infrastructure/db/client";
import { revokedSessions } from "@/infrastructure/db/schema";
import { withErrorHandler } from "@/lib/http";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/jwt";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  // Best-effort revocation: if we can extract the JTI from the cookie,
  // insert it into the revocation table. If anything fails (no cookie,
  // expired JWT, DB error), we still clear the cookie — the user's intent
  // to log out should always succeed.
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (cookie !== undefined) {
    const payload = await verifySession(cookie.value);
    if (payload !== null) {
      try {
        const expiresAt = new Date(Date.now() + serverEnv.SESSION_TTL_SECONDS * 1000);
        await getDb()
          .insert(revokedSessions)
          .values({ jti: payload.jti, expiresAt })
          .onConflictDoNothing();
      } catch (cause: unknown) {
        logger.warn({ err: cause }, "failed to insert session revocation (non-fatal)");
      }
    }
  }

  return response;
});
