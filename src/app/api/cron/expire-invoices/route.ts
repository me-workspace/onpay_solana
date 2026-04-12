/**
 * POST /api/cron/expire-invoices — sweep all stale pending invoices.
 *
 * Lazy expiration inside confirmInvoice handles the invoices merchants
 * are actively watching, but un-polled stale rows accumulate if no one
 * visits them. This endpoint cleans them up in a single SQL UPDATE.
 *
 * Guarded by a shared secret passed in the `x-cron-secret` header. Set
 * CRON_SECRET in production env and configure your scheduler (Vercel
 * Cron, systemd timer, external cron) to call this endpoint once per
 * minute with the matching header.
 *
 * If CRON_SECRET is not configured, the endpoint refuses all requests —
 * fail-closed default.
 */
import { NextResponse, type NextRequest } from "next/server";

import { lt } from "drizzle-orm";

import { serverEnv } from "@/config/env.server";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { revokedSessions } from "@/infrastructure/db/schema";
import { apiError } from "@/lib/api-error";
import { withErrorHandler } from "@/lib/http";
import { cleanupExpiredIdempotencyKeys } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { retryPendingWebhooks } from "@/lib/webhook-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Response = {
  readonly expired: number;
  readonly idempotencyKeysCleanedUp: number;
  readonly revokedSessionsCleanedUp: number;
  readonly webhooksRetried: number;
  readonly at: string;
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Fail-closed: if CRON_SECRET isn't configured, refuse all calls.
  const configured = serverEnv.CRON_SECRET;
  if (configured === undefined) {
    throw apiError("FORBIDDEN", "Cron endpoint is not configured.");
  }

  const provided = req.headers.get("x-cron-secret");
  if (provided !== configured) {
    throw apiError("UNAUTHORIZED", "Invalid cron secret.");
  }

  const log = logger.child({ route: "POST /api/cron/expire-invoices" });
  const db = getDb();
  const invoiceRepo = createInvoiceRepository(db);
  const now = new Date();

  const result = await invoiceRepo.expirePendingBefore(now);
  if (!result.ok) {
    log.error({ err: result.error }, "failed to expire invoices");
    throw apiError("INTERNAL_ERROR", "Failed to expire invoices");
  }

  // Also clean up expired idempotency keys (24h TTL).
  let idempotencyKeysCleanedUp = 0;
  try {
    idempotencyKeysCleanedUp = await cleanupExpiredIdempotencyKeys(db);
  } catch (cause: unknown) {
    log.warn({ err: cause }, "failed to clean up idempotency keys (non-fatal)");
  }

  // Clean up expired revoked sessions.
  let revokedSessionsCleanedUp = 0;
  try {
    const deleted = await db
      .delete(revokedSessions)
      .where(lt(revokedSessions.expiresAt, now))
      .returning({ jti: revokedSessions.jti });
    revokedSessionsCleanedUp = deleted.length;
  } catch (cause: unknown) {
    log.warn({ err: cause }, "failed to clean up revoked sessions (non-fatal)");
  }

  // Retry pending webhook deliveries.
  let webhooksRetried = 0;
  try {
    webhooksRetried = await retryPendingWebhooks(db);
  } catch (cause: unknown) {
    log.warn({ err: cause }, "failed to retry pending webhooks (non-fatal)");
  }

  log.info(
    { expired: result.value, idempotencyKeysCleanedUp, revokedSessionsCleanedUp, webhooksRetried },
    "expiration sweep complete",
  );

  const body: Response = {
    expired: result.value,
    idempotencyKeysCleanedUp,
    revokedSessionsCleanedUp,
    webhooksRetried,
    at: now.toISOString(),
  };
  return NextResponse.json(body, { status: 200 });
});
