/**
 * POST /api/auth/nonce — issue a signed challenge for a wallet to prove ownership.
 *
 * The client calls this with their claimed wallet address, receives back
 * a human-readable `message` to sign and an opaque `challenge` JWT. The
 * wallet signs the `message` bytes via `signMessage`, then posts the
 * signature + the challenge back to /api/auth/verify.
 *
 * The challenge is a short-lived (5 min) JWT containing the wallet address
 * and a random nonce. We do NOT store any server-side state — all the
 * information needed to verify is inside the signed JWT itself, so this
 * flow scales horizontally and recovers cleanly from restarts.
 */
import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api-error";
import { parseJsonBody, withErrorHandler } from "@/lib/http";
import { signChallenge } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(32).max(44),
});

type NonceResponse = {
  readonly message: string;
  readonly challenge: string;
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req, bodySchema);

  // Validate the wallet address shape before issuing a challenge. We don't
  // need to verify it's a real on-curve pubkey here — that happens during
  // signature verification in /api/auth/verify.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.walletAddress)) {
    throw apiError("INVALID_REQUEST", "Invalid Solana wallet address");
  }

  // 128-bit random nonce, base64 for JSON safety.
  const nonce = randomBytes(16).toString("base64url");
  const message = `Sign in to OnPay\n\nWallet: ${body.walletAddress}\nNonce: ${nonce}`;

  const challenge = await signChallenge({
    wallet: body.walletAddress,
    nonce,
  });

  const response: NonceResponse = { message, challenge };
  return NextResponse.json(response, { status: 200 });
});
