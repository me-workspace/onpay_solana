/**
 * Webhook signature verification for the OnPay Node.js SDK.
 *
 * Implements Stripe-compatible HMAC-SHA256 signature verification. Merchants
 * use this to confirm that an incoming webhook request truly originated from
 * OnPay and was not tampered with.
 *
 * Signature header format: `t=<unix_timestamp>,v1=<hmac_hex>`
 *
 * @module
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { OnPayWebhookError } from "./errors.js";
import type { WebhookEvent } from "./types.js";

/** Default tolerance for webhook timestamp verification (5 minutes). */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Parse the `OnPay-Signature` header into its component parts.
 *
 * @param header - The raw `OnPay-Signature` header value.
 * @returns An object with `timestamp` (number) and `signatures` (string[]).
 * @throws {OnPayWebhookError} If the header format is invalid.
 */
function parseSignatureHeader(header: string): {
  timestamp: number;
  signatures: string[];
} {
  const parts = header.split(",");
  let timestamp = -1;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === undefined || value === undefined) {
      throw new OnPayWebhookError("Invalid signature header format");
    }

    if (key === "t") {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new OnPayWebhookError("Invalid timestamp in signature header");
      }
      timestamp = parsed;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === -1) {
    throw new OnPayWebhookError("Missing timestamp in signature header");
  }
  if (signatures.length === 0) {
    throw new OnPayWebhookError("Missing v1 signature in signature header");
  }

  return { timestamp, signatures };
}

/**
 * Constant-time comparison of two hex strings.
 *
 * @param a - First hex string.
 * @param b - Second hex string.
 * @returns `true` if the strings are equal.
 */
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a webhook signature and return the parsed event body.
 *
 * This function:
 *   1. Parses the `OnPay-Signature` header to extract timestamp and v1 signature.
 *   2. Computes the expected HMAC-SHA256 over `timestamp.rawBody`.
 *   3. Compares signatures using constant-time comparison.
 *   4. Validates the timestamp is within the allowed tolerance window.
 *   5. Returns the parsed JSON body as a `WebhookEvent`.
 *
 * @param rawBody         - The raw request body as a string.
 * @param signatureHeader - The value of the `OnPay-Signature` header.
 * @param endpointSecret  - The webhook endpoint's signing secret.
 * @param tolerance       - Maximum age in seconds (default: 300).
 * @returns The parsed webhook event body.
 * @throws {OnPayWebhookError} If signature verification fails.
 */
export function constructEvent(
  rawBody: string,
  signatureHeader: string,
  endpointSecret: string,
  tolerance: number = DEFAULT_TOLERANCE_SECONDS,
): WebhookEvent {
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  // Compute expected signature.
  const signedPayload = `${String(timestamp)}.${rawBody}`;
  const expectedSignature = createHmac("sha256", endpointSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  // Check if any v1 signature matches (constant-time).
  const matched = signatures.some((sig) => secureCompare(sig, expectedSignature));
  if (!matched) {
    throw new OnPayWebhookError(
      "Webhook signature verification failed. The payload may have been tampered with.",
    );
  }

  // Check timestamp tolerance.
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;
  if (age > tolerance) {
    throw new OnPayWebhookError(
      `Webhook timestamp is too old. Event is ${String(age)}s old, tolerance is ${String(tolerance)}s.`,
    );
  }
  if (age < -tolerance) {
    throw new OnPayWebhookError("Webhook timestamp is in the future. Check your server clock.");
  }

  // Parse and return the event body.
  try {
    return JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new OnPayWebhookError("Failed to parse webhook body as JSON.");
  }
}
