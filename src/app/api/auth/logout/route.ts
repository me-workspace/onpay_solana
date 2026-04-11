/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * Stateless logout: we don't track active sessions server-side, so all
 * this endpoint does is send back a Set-Cookie with an empty value and
 * immediate expiration. The browser drops the cookie, future requests
 * arrive without auth.
 */
import { NextResponse, type NextRequest } from "next/server";

import { withErrorHandler } from "@/lib/http";
import { SESSION_COOKIE_NAME } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/require-await
export const POST = withErrorHandler(async (_req: NextRequest) => {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
});
