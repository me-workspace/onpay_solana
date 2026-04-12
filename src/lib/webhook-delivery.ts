/**
 * Webhook delivery service.
 *
 * Handles delivering webhook events to merchant endpoints with:
 *   - HMAC-SHA256 signed payloads (Stripe-compatible)
 *   - Exponential backoff retries (1m, 5m, 30m, 2h, 8h — max 5 attempts)
 *   - Response logging (first 1KB) for debugging
 *   - Async dispatch (fire-and-forget from the caller's perspective)
 *
 * Three entry points:
 *   1. `deliverWebhook` — send a single delivery to an endpoint
 *   2. `retryPendingWebhooks` — sweep and retry all failed deliveries (cron)
 *   3. `dispatchInvoiceEvent` — fan out an event to all matching endpoints
 */
import { and, eq, isNull, lte, lt } from "drizzle-orm";

import type { Database } from "@/infrastructure/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/infrastructure/db/schema";

import { logger } from "./logger";
import { buildWebhookHeaders } from "./webhook-signing";

/** Maximum number of delivery attempts before giving up. */
const MAX_ATTEMPTS = 5;

/** Timeout for each HTTP POST to the merchant's URL (ms). */
const DELIVERY_TIMEOUT_MS = 10_000;

/** Maximum response body length to store for debugging (bytes). */
const MAX_RESPONSE_BODY_BYTES = 1024;

/**
 * Exponential backoff delays in milliseconds.
 * Index = attempt number (0-based, so attempt 1 uses index 0).
 * After MAX_ATTEMPTS, we give up (nextRetryAt = null).
 */
const BACKOFF_DELAYS_MS: readonly number[] = [
  1 * 60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  30 * 60 * 1000, // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
  8 * 60 * 60 * 1000, // 8 hours
];

/**
 * Deliver a webhook event to a specific endpoint.
 *
 * Inserts a delivery row, then attempts the HTTP POST. On success (2xx),
 * sets `deliveredAt` and records the status. On failure, increments
 * `attempts` and schedules a retry with exponential backoff.
 *
 * @param db         - Database instance
 * @param endpointId - UUID of the webhook endpoint
 * @param eventType  - Event type string, e.g. "invoice.paid"
 * @param payload    - JSON-serializable event body (will be stringified)
 */
export async function deliverWebhook(
  db: Database,
  endpointId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  const log = logger.child({ endpointId, eventType });
  const body = JSON.stringify(payload);

  // Fetch the endpoint to get the URL and secret.
  const endpoints = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      enabled: webhookEndpoints.enabled,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .limit(1);

  const endpoint = endpoints[0];
  if (endpoint === undefined) {
    log.warn("webhook endpoint not found, skipping delivery");
    return;
  }
  if (!endpoint.enabled) {
    log.debug("webhook endpoint disabled, skipping delivery");
    return;
  }

  // Insert the delivery row.
  const inserted = await db
    .insert(webhookDeliveries)
    .values({
      endpointId,
      eventType,
      payload: body,
      attempts: 0,
    })
    .returning({ id: webhookDeliveries.id });

  const deliveryRow = inserted[0];
  if (deliveryRow === undefined) {
    log.error("failed to insert webhook delivery row");
    return;
  }

  await attemptDelivery(db, deliveryRow.id, endpoint.url, endpoint.secret, eventType, body, 0);
}

/**
 * Attempt to deliver a webhook payload via HTTP POST.
 *
 * Updates the delivery row with the result (success or failure + retry schedule).
 */
async function attemptDelivery(
  db: Database,
  deliveryId: string,
  url: string,
  secret: string,
  eventType: string,
  body: string,
  currentAttempts: number,
): Promise<void> {
  const log = logger.child({ deliveryId, url, eventType, attempt: currentAttempts + 1 });
  const newAttempts = currentAttempts + 1;

  let httpStatus: number | null = null;
  let responseBody: string | null = null;

  try {
    const headers = buildWebhookHeaders(secret, body, eventType);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, DELIVERY_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      httpStatus = response.status;

      // Read response body (first 1KB) for debugging.
      try {
        const text = await response.text();
        responseBody = text.slice(0, MAX_RESPONSE_BODY_BYTES);
      } catch {
        responseBody = null;
      }

      if (response.ok) {
        // Success — mark as delivered.
        await db
          .update(webhookDeliveries)
          .set({
            attempts: newAttempts,
            httpStatus,
            responseBody,
            deliveredAt: new Date(),
            nextRetryAt: null,
          })
          .where(eq(webhookDeliveries.id, deliveryId));

        log.info({ httpStatus }, "webhook delivered successfully");
        return;
      }

      log.warn({ httpStatus }, "webhook delivery failed with non-2xx status");
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const message = fetchErr instanceof Error ? fetchErr.message : "unknown fetch error";
      log.warn({ err: fetchErr }, `webhook delivery failed: ${message}`);
      responseBody = message.slice(0, MAX_RESPONSE_BODY_BYTES);
    }
  } catch (outerErr: unknown) {
    log.error({ err: outerErr }, "unexpected error during webhook delivery");
  }

  // Failure path: schedule retry or give up.
  const backoffDelay = BACKOFF_DELAYS_MS[newAttempts - 1];
  const nextRetryAt =
    newAttempts < MAX_ATTEMPTS && backoffDelay !== undefined
      ? new Date(Date.now() + backoffDelay)
      : null;

  await db
    .update(webhookDeliveries)
    .set({
      attempts: newAttempts,
      httpStatus,
      responseBody,
      nextRetryAt,
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  if (nextRetryAt === null) {
    log.warn({ attempts: newAttempts }, "webhook delivery exhausted all retries, giving up");
  } else {
    log.info(
      { nextRetryAt: nextRetryAt.toISOString(), attempts: newAttempts },
      "webhook retry scheduled",
    );
  }
}

/**
 * Retry all pending webhook deliveries that are due.
 *
 * Called by the cron job. Finds all deliveries where:
 *   - `nextRetryAt <= now`
 *   - `deliveredAt IS NULL`
 *   - `attempts < MAX_ATTEMPTS`
 *
 * @returns The number of deliveries retried.
 */
export async function retryPendingWebhooks(db: Database): Promise<number> {
  const log = logger.child({ task: "retryPendingWebhooks" });
  const now = new Date();

  const pending = await db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      eventType: webhookDeliveries.eventType,
      payload: webhookDeliveries.payload,
      attempts: webhookDeliveries.attempts,
    })
    .from(webhookDeliveries)
    .where(
      and(
        lte(webhookDeliveries.nextRetryAt, now),
        isNull(webhookDeliveries.deliveredAt),
        lt(webhookDeliveries.attempts, MAX_ATTEMPTS),
      ),
    );

  if (pending.length === 0) {
    log.debug("no pending webhook deliveries to retry");
    return 0;
  }

  log.info({ count: pending.length }, "retrying pending webhook deliveries");

  for (const delivery of pending) {
    // Look up the endpoint for URL and secret.
    const endpoints = await db
      .select({
        url: webhookEndpoints.url,
        secret: webhookEndpoints.secret,
        enabled: webhookEndpoints.enabled,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, delivery.endpointId))
      .limit(1);

    const endpoint = endpoints[0];
    if (endpoint?.enabled !== true) {
      // Endpoint deleted or disabled — give up on this delivery.
      await db
        .update(webhookDeliveries)
        .set({ nextRetryAt: null })
        .where(eq(webhookDeliveries.id, delivery.id));
      continue;
    }

    await attemptDelivery(
      db,
      delivery.id,
      endpoint.url,
      endpoint.secret,
      delivery.eventType,
      delivery.payload,
      delivery.attempts,
    );
  }

  return pending.length;
}

/**
 * Dispatch an invoice event to all matching webhook endpoints.
 *
 * Finds all enabled webhook endpoints for the given merchant that subscribe
 * to the event type, then creates a delivery for each. Deliveries are
 * dispatched asynchronously (fire-and-forget with error logging).
 *
 * @param db        - Database instance
 * @param invoice   - Object with at least `{ id, merchantId, reference, status }`
 * @param eventType - The event to dispatch, e.g. "invoice.paid"
 */
export function dispatchInvoiceEvent(
  db: Database,
  invoice: {
    readonly id: string;
    readonly merchantId: string;
    readonly reference: string;
    readonly status: string;
  },
  eventType: string,
): void {
  const log = logger.child({ invoiceId: invoice.id, eventType });

  // Fire-and-forget — never block the caller.
  void (async () => {
    try {
      // Find all matching endpoints.
      const endpoints = await db
        .select({
          id: webhookEndpoints.id,
          events: webhookEndpoints.events,
        })
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.merchantId, invoice.merchantId),
            eq(webhookEndpoints.enabled, true),
          ),
        );

      // Filter to endpoints that subscribe to this event type.
      const matching = endpoints.filter((ep) => ep.events.includes(eventType));

      if (matching.length === 0) {
        log.debug("no webhook endpoints subscribe to this event");
        return;
      }

      log.info({ endpointCount: matching.length }, "dispatching webhook event");

      const payload = {
        type: eventType,
        data: {
          invoiceId: invoice.id,
          reference: invoice.reference,
          status: invoice.status,
        },
        createdAt: new Date().toISOString(),
      };

      // Deliver to each endpoint concurrently.
      const results = await Promise.allSettled(
        matching.map((ep) => deliverWebhook(db, ep.id, eventType, payload)),
      );

      for (const result of results) {
        if (result.status === "rejected") {
          log.error({ err: result.reason as unknown }, "webhook delivery dispatch failed");
        }
      }
    } catch (dispatchErr: unknown) {
      log.error({ err: dispatchErr }, "failed to dispatch invoice webhook event");
    }
  })();
}
