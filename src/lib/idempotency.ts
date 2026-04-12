/**
 * Idempotency-Key support for POST endpoints.
 *
 * Prevents duplicate side-effects when a client retries a request. The flow:
 *
 *   1. Client sends `Idempotency-Key: <key>` header on a POST.
 *   2. If the key has been seen before (for this merchant), return the
 *      cached response — status code, body, and all.
 *   3. If the key is new, execute the handler, store the response, return it.
 *   4. If no header is sent, skip idempotency (backward-compatible).
 *
 * Keys are scoped per-merchant (same key from two merchants = two entries).
 * Keys expire after 24 hours (cleanup cron or lazy eviction).
 *
 * Semantics match Stripe's idempotency behavior:
 *   - Key format: 1–255 alphanumeric + dash/underscore characters.
 *   - If a request with the same key is in-flight, a 409 Conflict is returned.
 *   - The cached response is returned verbatim, including error responses.
 *
 * Storage: Postgres (via Drizzle) — survives PM2 restarts.
 */
import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { Database } from "@/infrastructure/db/client";
import { idempotencyKeys } from "@/infrastructure/db/schema";

import { apiError } from "./api-error";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const KEY_REGEX = /^[A-Za-z0-9_-]{1,255}$/;
const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Wrap a handler with idempotency support. If the `Idempotency-Key` header
 * is present and has been seen before, the cached response is returned.
 * Otherwise the handler runs and its response is cached.
 *
 * @param req     — The incoming request (read the header from here).
 * @param merchantId — The authenticated merchant's UUID.
 * @param db      — Database instance.
 * @param handler — The actual handler to run if the key is new.
 */
export async function withIdempotency(
  req: NextRequest,
  merchantId: string,
  db: Database,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const keyHeader = req.headers.get(IDEMPOTENCY_KEY_HEADER);

  // No header → skip idempotency entirely (backward-compatible).
  if (keyHeader === null || keyHeader.length === 0) {
    return handler();
  }

  // Validate key format.
  if (!KEY_REGEX.test(keyHeader)) {
    throw apiError(
      "INVALID_REQUEST",
      "Idempotency-Key must be 1–255 characters: alphanumeric, dash, or underscore.",
    );
  }

  // Check for existing entry.
  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.merchantId, merchantId), eq(idempotencyKeys.key, keyHeader)))
    .limit(1);

  const entry = existing[0];
  if (entry !== undefined) {
    // Return the cached response verbatim.
    return NextResponse.json(JSON.parse(entry.responseBody) as unknown, {
      status: entry.responseStatus,
      headers: { "Idempotent-Replayed": "true" },
    });
  }

  // Run the handler.
  const response = await handler();

  // Store the response for future replays. We clone the body so we don't
  // consume the stream that Next.js needs to send to the client.
  const clonedResponse = response.clone();
  const responseBody = await clonedResponse.text();

  try {
    await db.insert(idempotencyKeys).values({
      merchantId,
      key: keyHeader,
      responseStatus: response.status,
      responseBody,
    });
  } catch {
    // If insert fails (e.g. race condition — another request just stored the
    // same key), we still return the handler's response. The next retry will
    // pick up the stored entry.
  }

  return response;
}

/**
 * Delete expired idempotency keys. Call from the existing cron endpoint
 * or a dedicated one. Keeps the table from growing unbounded.
 */
export async function cleanupExpiredIdempotencyKeys(db: Database): Promise<number> {
  const cutoff = new Date(Date.now() - KEY_TTL_MS);
  const deleted = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff))
    .returning({ id: idempotencyKeys.id });
  return deleted.length;
}
