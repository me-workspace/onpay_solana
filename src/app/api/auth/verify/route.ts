/**
 * POST /api/auth/verify — verify an ed25519 wallet signature and issue a session.
 *
 * Request body:
 *   - walletAddress: base58 pubkey the caller claims to own
 *   - challenge:     the JWT returned by /api/auth/nonce
 *   - signature:     base64-encoded 64-byte ed25519 signature of the message
 *
 * The server:
 *   1. Verifies the challenge JWT is signed by us and not expired.
 *   2. Reconstructs the exact message string from the nonce.
 *   3. Verifies the ed25519 signature using tweetnacl against the wallet
 *      pubkey decoded from base58.
 *   4. On success, issues a session JWT and sets it as an httpOnly cookie.
 *
 * Mismatched wallets between the challenge and the claim are rejected —
 * you can't swap challenges between wallets.
 */
import bs58 from "bs58";
import { NextResponse, type NextRequest } from "next/server";
import nacl from "tweetnacl";
import { z } from "zod";

import { serverEnv } from "@/config/env.server";
import { apiError } from "@/lib/api-error";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  parseJsonBody,
  withErrorHandler,
} from "@/lib/http";
import { signSession, verifyChallenge, SESSION_COOKIE_NAME } from "@/lib/jwt";
import { logger } from "@/lib/logger";
import { authRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(32).max(44),
  challenge: z.string().min(10),
  /** Base64-encoded 64-byte ed25519 signature. */
  signature: z.string().min(10),
});

type VerifyResponse = {
  readonly ok: true;
  readonly wallet: string;
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(authRateLimiter.check(clientKeyFromRequest(req)), "auth/verify");
  const body = await parseJsonBody(req, bodySchema);
  const log = logger.child({ route: "POST /api/auth/verify" });

  // 1. Verify the challenge JWT — checks signature, expiration, issuer.
  let challengePayload;
  try {
    challengePayload = await verifyChallenge(body.challenge);
  } catch {
    throw apiError("UNAUTHORIZED", "Challenge is invalid or expired. Request a new nonce.");
  }

  // 2. The challenge must match the claimed wallet exactly.
  if (challengePayload.wallet !== body.walletAddress) {
    log.warn(
      { claimed: body.walletAddress, inChallenge: challengePayload.wallet },
      "wallet mismatch between challenge and verify body",
    );
    throw apiError("UNAUTHORIZED", "Challenge does not match the claimed wallet.");
  }

  // 3. Reconstruct the exact message the client was asked to sign. This
  //    string MUST match /api/auth/nonce byte-for-byte or verification fails.
  const message = `Sign in to OnPay\n\nWallet: ${body.walletAddress}\nNonce: ${challengePayload.nonce}`;
  const messageBytes = new TextEncoder().encode(message);

  // 4. Decode the signature and the wallet pubkey, then verify.
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = Buffer.from(body.signature, "base64");
  } catch {
    throw apiError("INVALID_REQUEST", "Signature is not valid base64");
  }
  if (signatureBytes.length !== 64) {
    throw apiError("INVALID_REQUEST", "Signature must be exactly 64 bytes");
  }

  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = bs58.decode(body.walletAddress);
  } catch {
    throw apiError("INVALID_REQUEST", "Wallet address is not valid base58");
  }
  if (pubkeyBytes.length !== 32) {
    throw apiError("INVALID_REQUEST", "Wallet pubkey must be exactly 32 bytes");
  }

  const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
  if (!valid) {
    log.warn({ wallet: body.walletAddress }, "signature verification failed");
    throw apiError("UNAUTHORIZED", "Invalid signature");
  }

  // 5. Signature is valid — issue a session JWT and set it as an httpOnly cookie.
  const sessionJwt = await signSession({ wallet: body.walletAddress });

  const responseBody: VerifyResponse = { ok: true, wallet: body.walletAddress };
  const response = NextResponse.json(responseBody, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, sessionJwt, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: serverEnv.SESSION_TTL_SECONDS,
  });

  log.info({ wallet: body.walletAddress }, "wallet signed in");
  return response;
});
