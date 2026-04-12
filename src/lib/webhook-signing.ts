/**
 * Webhook signing utilities.
 *
 * Implements Stripe-compatible HMAC-SHA256 webhook signatures. The merchant
 * receives a signature header on every webhook delivery and can verify it
 * using their signing secret to confirm the payload originated from OnPay
 * and was not tampered with.
 *
 * Signature format: `t=<unix_timestamp>,v1=<hmac_hex>`
 *
 * Verification steps (for the merchant):
 *   1. Extract `t` and `v1` from the `OnPay-Signature` header.
 *   2. Construct the signed payload: `${t}.${raw_body}`.
 *   3. Compute HMAC-SHA256 of the signed payload with their secret.
 *   4. Compare the computed hex digest with `v1` (constant-time).
 *   5. Reject if the timestamp is too old (e.g. > 5 minutes) to prevent replay.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Generate a 32-byte hex-encoded webhook signing secret.
 *
 * Called once when a webhook endpoint is created. The secret is stored
 * in the database and shown to the merchant exactly once.
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Compute an HMAC-SHA256 hex signature over the timestamped payload.
 *
 * The signed payload format is `${timestamp}.${body}` — identical to
 * Stripe's scheme. This binds the signature to a specific timestamp,
 * preventing replay attacks.
 *
 * @param secret    - Hex-encoded HMAC secret
 * @param timestamp - Unix timestamp (seconds) included in the signature header
 * @param body      - Raw JSON body string
 * @returns Hex-encoded HMAC-SHA256 digest
 */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  const signedPayload = `${String(timestamp)}.${body}`;
  return createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
}

/**
 * Build the complete set of webhook delivery headers.
 *
 * @param secret    - Hex-encoded HMAC secret for this endpoint
 * @param body      - Serialized JSON body
 * @param eventType - The event type string, e.g. "invoice.paid"
 * @returns Headers to attach to the POST request
 */
/**
 * Verify a webhook signature provided by the caller.
 *
 * Performs constant-time comparison to prevent timing attacks and checks
 * that the timestamp is within `maxAgeSeconds` to prevent replay attacks.
 *
 * @param secret             - Hex-encoded HMAC secret
 * @param timestamp          - Unix timestamp (seconds) from the signature header
 * @param body               - Raw JSON body string
 * @param providedSignature  - Hex-encoded HMAC signature provided by the caller
 * @param maxAgeSeconds      - Maximum age of the timestamp in seconds (default 300)
 * @returns `true` if the signature is valid and the timestamp is fresh
 */
export function verifyWebhookSignature(
  secret: string,
  timestamp: number,
  body: string,
  providedSignature: string,
  maxAgeSeconds = 300,
): boolean {
  // Check timestamp freshness to prevent replay attacks.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > maxAgeSeconds) {
    return false;
  }

  // Compute the expected signature.
  const expected = signWebhookPayload(secret, timestamp, body);

  // Pad both buffers to equal length for timingSafeEqual (requires equal-length inputs).
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(providedSignature, "utf8");
  const maxLen = Math.max(expectedBuf.length, providedBuf.length);

  // If either is empty, reject immediately.
  if (maxLen === 0) return false;

  const paddedExpected = Buffer.alloc(maxLen, 0);
  const paddedProvided = Buffer.alloc(maxLen, 0);
  expectedBuf.copy(paddedExpected);
  providedBuf.copy(paddedProvided);

  // Constant-time comparison — prevents timing side-channel attacks.
  const signaturesMatch = timingSafeEqual(paddedExpected, paddedProvided);

  // Also check lengths match to reject padded forgeries.
  return signaturesMatch && expectedBuf.length === providedBuf.length;
}

export function buildWebhookHeaders(
  secret: string,
  body: string,
  eventType: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, timestamp, body);
  const eventId = randomUUID();

  return {
    "Content-Type": "application/json",
    "OnPay-Signature": `t=${String(timestamp)},v1=${signature}`,
    "OnPay-Event-Id": eventId,
    "OnPay-Event-Type": eventType,
  };
}
