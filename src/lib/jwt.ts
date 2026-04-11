/**
 * JWT sign/verify helpers built on `jose`.
 *
 * We use two separate token types, both signed with the same JWT_SECRET:
 *
 *   1. **Challenge** — issued by POST /api/auth/nonce. Contains a random
 *      nonce and the wallet address, expires in 5 minutes. The client
 *      signs the nonce with their Solana wallet and sends the signature
 *      + the original challenge back to POST /api/auth/verify.
 *
 *   2. **Session** — issued by POST /api/auth/verify after a successful
 *      signature check. Contains the wallet address, expires per
 *      SESSION_TTL_SECONDS. Stored as an httpOnly cookie on the client.
 *
 * Keeping challenges stateless (JWT-signed instead of stored server-side)
 * means we don't need Redis or a nonces table — the whole auth flow
 * scales horizontally and recovers cleanly from a restart.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { serverEnv } from "@/config/env.server";

const ISSUER = "onpay";
const CHALLENGE_TYP = "onpay-challenge";
const SESSION_TYP = "onpay-session";

const CHALLENGE_TTL_SECONDS = 300; // 5 minutes

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv.JWT_SECRET);
}

// ---------------------------------------------------------------------------
// Challenge tokens
// ---------------------------------------------------------------------------

export type ChallengePayload = {
  /** Wallet address (base58) requesting the challenge. */
  readonly wallet: string;
  /** Random nonce bytes, base64-encoded. */
  readonly nonce: string;
};

/** Issue a new challenge JWT for a given wallet. */
export async function signChallenge(payload: ChallengePayload): Promise<string> {
  return new SignJWT({ ...payload, typ: CHALLENGE_TYP })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${String(CHALLENGE_TTL_SECONDS)}s`)
    .sign(getSecretKey());
}

/** Verify a challenge JWT. Returns the decoded payload or throws. */
export async function verifyChallenge(jwt: string): Promise<ChallengePayload> {
  const { payload } = await jwtVerify(jwt, getSecretKey(), { issuer: ISSUER });
  if (payload.typ !== CHALLENGE_TYP) {
    throw new Error(`Expected challenge token, got ${String(payload.typ)}`);
  }
  if (typeof payload.wallet !== "string" || typeof payload.nonce !== "string") {
    throw new Error("Invalid challenge payload shape");
  }
  return { wallet: payload.wallet, nonce: payload.nonce };
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

export type SessionPayload = {
  readonly wallet: string;
};

/** Issue a session JWT after a successful signature verification. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload, typ: SESSION_TYP })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${String(serverEnv.SESSION_TTL_SECONDS)}s`)
    .sign(getSecretKey());
}

/**
 * Verify a session JWT. Returns the decoded payload or `null` on any
 * failure (expired, malformed, wrong type). Never throws — callers
 * treat a null return as "not authenticated".
 */
export async function verifySession(jwt: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(jwt, getSecretKey(), { issuer: ISSUER });
    if (payload.typ !== SESSION_TYP) return null;
    if (typeof payload.wallet !== "string") return null;
    return { wallet: payload.wallet };
  } catch {
    return null;
  }
}

/** Name of the httpOnly cookie that carries the session JWT. */
export const SESSION_COOKIE_NAME = "onpay_session";

/** Type-narrowing helper when inspecting raw payloads. */
export type AnyJWTPayload = JWTPayload & { readonly typ?: string };
