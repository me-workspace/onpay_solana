/**
 * POST /api/webhooks/midtrans -- Midtrans payment notification handler.
 *
 * Receives asynchronous payment status updates from Midtrans. The webhook
 * is called when a QRIS payment status changes (settlement, expire, cancel,
 * deny, etc.).
 *
 * Security:
 *   - Signature verification via SHA-512 hash of
 *     `order_id + status_code + gross_amount + server_key`.
 *   - Midtrans does NOT send auth headers -- we rely solely on the signature.
 *   - Always returns 200 OK so Midtrans doesn't retry unnecessarily.
 *
 * On settlement:
 *   - Updates the QRIS charge status to `settlement` with `paidAt`.
 *   - Marks the parent invoice as `paid` (if not already paid by crypto).
 *   - Dispatches `invoice.paid` webhook event to the merchant.
 *
 * On expire/cancel/deny:
 *   - Updates the QRIS charge status accordingly.
 *   - Does NOT update the invoice -- the crypto path might still work.
 */
import { createHash } from "crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { eq } from "drizzle-orm";

import { serverEnv } from "@/config/env.server";
import type { InvoiceId } from "@/domain/entities/invoice";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { qrisCharges } from "@/infrastructure/db/schema";
import { clientKeyFromRequest, enforceRateLimit, withErrorHandler } from "@/lib/http";
import { logger } from "@/lib/logger";
import { txRateLimiter } from "@/lib/rate-limit";
import { dispatchInvoiceEvent } from "@/lib/webhook-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Notification schema
// ---------------------------------------------------------------------------

const midtransNotificationSchema = z.object({
  transaction_status: z.string(),
  order_id: z.string(),
  transaction_id: z.string().optional(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  payment_type: z.string().optional(),
  fraud_status: z.string().optional(),
});

type MidtransNotification = z.infer<typeof midtransNotificationSchema>;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the Midtrans notification signature.
 *
 * Midtrans computes: SHA-512(order_id + status_code + gross_amount + server_key)
 * and sends it as `signature_key` in the notification body.
 */
function verifySignature(notification: MidtransNotification, serverKey: string): boolean {
  const payload =
    notification.order_id + notification.status_code + notification.gross_amount + serverKey;

  const computed = createHash("sha512").update(payload).digest("hex");
  return computed === notification.signature_key;
}

// ---------------------------------------------------------------------------
// Terminal QRIS statuses that indicate payment success.
// ---------------------------------------------------------------------------

/** Statuses that mean the buyer paid successfully. */
const SETTLEMENT_STATUSES = new Set(["settlement", "capture"]);

/** Statuses that mean the QRIS charge failed/expired (don't touch invoice). */
const FAILURE_STATUSES = new Set(["expire", "cancel", "deny"]);

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(txRateLimiter.check(clientKeyFromRequest(req)), "webhooks/midtrans");

  const log = logger.child({ route: "POST /api/webhooks/midtrans" });

  // 1. Ensure Midtrans is configured.
  const serverKey = serverEnv.MIDTRANS_SERVER_KEY;
  if (serverKey === undefined) {
    log.warn("Midtrans webhook received but MIDTRANS_SERVER_KEY is not configured");
    // Return 200 anyway to prevent retries.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 2. Parse the notification body.
  let rawBody: unknown;
  try {
    rawBody = (await req.json()) as unknown;
  } catch {
    log.warn("Midtrans webhook received with invalid JSON body");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const parsed = midtransNotificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    log.warn({ errors: parsed.error.flatten() }, "Midtrans notification failed validation");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const notification = parsed.data;
  log.info(
    {
      orderId: notification.order_id,
      transactionStatus: notification.transaction_status,
      statusCode: notification.status_code,
    },
    "Midtrans notification received",
  );

  // 3. Verify the signature.
  if (!verifySignature(notification, serverKey)) {
    log.warn(
      { orderId: notification.order_id },
      "Midtrans notification signature verification failed",
    );
    // Return 200 to prevent retries -- invalid signatures should not be retried.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 4. Look up the QRIS charge by Midtrans order ID.
  const db = getDb();
  const qrisRows = await db
    .select({
      id: qrisCharges.id,
      invoiceId: qrisCharges.invoiceId,
      status: qrisCharges.status,
    })
    .from(qrisCharges)
    .where(eq(qrisCharges.midtransOrderId, notification.order_id))
    .limit(1);

  const qrisRow = qrisRows[0];
  if (qrisRow === undefined) {
    log.warn({ orderId: notification.order_id }, "QRIS charge not found for Midtrans order ID");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const transactionStatus = notification.transaction_status;

  // 5. Handle settlement/capture -- mark invoice as paid.
  if (SETTLEMENT_STATUSES.has(transactionStatus)) {
    // Update QRIS charge to settlement.
    await db
      .update(qrisCharges)
      .set({
        status: "settlement",
        midtransTransactionId: notification.transaction_id ?? null,
        paidAt: new Date(),
      })
      .where(eq(qrisCharges.id, qrisRow.id));

    // Update the parent invoice to paid (if not already).
    const invoiceRepo = createInvoiceRepository(db);
    const invoiceResult = await invoiceRepo.findById(qrisRow.invoiceId as InvoiceId);
    if (invoiceResult.ok && invoiceResult.value !== null) {
      const inv = invoiceResult.value;
      if (inv.status === "pending") {
        const updateResult = await invoiceRepo.updateStatus(inv.id, "paid");

        // Dispatch webhook event.
        if (updateResult.ok && updateResult.value.status === "paid") {
          dispatchInvoiceEvent(
            db,
            {
              id: updateResult.value.id,
              merchantId: updateResult.value.merchantId,
              reference: updateResult.value.reference,
              status: updateResult.value.status,
            },
            "invoice.paid",
          );
        }
      }
    }

    log.info(
      { orderId: notification.order_id, invoiceId: qrisRow.invoiceId },
      "QRIS payment settled, invoice marked as paid",
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 6. Handle failure statuses -- update QRIS charge only.
  if (FAILURE_STATUSES.has(transactionStatus)) {
    await db
      .update(qrisCharges)
      .set({
        status: transactionStatus,
        midtransTransactionId: notification.transaction_id ?? null,
      })
      .where(eq(qrisCharges.id, qrisRow.id));

    log.info(
      { orderId: notification.order_id, status: transactionStatus },
      "QRIS charge status updated (non-settlement)",
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 7. Unknown/pending status -- log and acknowledge.
  log.info(
    { orderId: notification.order_id, status: transactionStatus },
    "Midtrans notification with unhandled status, acknowledged",
  );

  return NextResponse.json({ ok: true }, { status: 200 });
});
