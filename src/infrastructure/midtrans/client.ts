/**
 * Midtrans Core API v2 client for QRIS payments.
 *
 * Handles creating QRIS charges and checking transaction status via the
 * Midtrans Core API. Uses global `fetch` for HTTP requests -- no external
 * HTTP client dependency.
 *
 * Authentication is done via HTTP Basic Auth with the server key as the
 * username and an empty password (Base64-encoded `SERVER_KEY:`).
 *
 * This module is server-only and must never be imported from client code.
 */
import "server-only";

import { serverEnv } from "@/config/env.server";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for creating a QRIS charge. */
export type CreateQrisChargeParams = {
  /** Unique order ID for Midtrans. Must be unique across all transactions. */
  readonly orderId: string;
  /** Amount in IDR (integer, no decimals). */
  readonly grossAmount: number;
};

/** Successful QRIS charge creation result. */
export type QrisChargeResult = {
  readonly transactionId: string;
  readonly orderId: string;
  readonly transactionStatus: string;
  readonly qrisUrl: string;
};

/** Midtrans transaction status response. */
export type MidtransTransactionStatus = {
  readonly transaction_id: string;
  readonly order_id: string;
  readonly transaction_status: string;
  readonly status_code: string;
  readonly gross_amount: string;
  readonly payment_type: string;
};

/** Midtrans API error shape. */
export type MidtransApiError = {
  readonly statusCode: number;
  readonly statusMessage: string | undefined;
  readonly validationMessages?: readonly string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const log = logger.child({ module: "midtrans-client" });

/**
 * Returns the base URL for the Midtrans Core API.
 * Uses sandbox by default; production when `MIDTRANS_IS_PRODUCTION` is true.
 */
function getBaseUrl(): string {
  return serverEnv.MIDTRANS_IS_PRODUCTION
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

/**
 * Build the HTTP Basic Auth header value from the server key.
 * Midtrans expects `Base64(SERVER_KEY:)` -- note the trailing colon.
 */
function getAuthHeader(): string {
  const serverKey = serverEnv.MIDTRANS_SERVER_KEY;
  if (serverKey === undefined) {
    throw new Error("MIDTRANS_SERVER_KEY is not configured");
  }
  // Use Buffer for Base64 encoding (Node.js only).
  const encoded = Buffer.from(`${serverKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Check whether Midtrans QRIS integration is enabled.
 * Returns true only when the server key is configured.
 */
export function isMidtransEnabled(): boolean {
  return serverEnv.MIDTRANS_SERVER_KEY !== undefined;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

/**
 * Create a QRIS charge via the Midtrans Core API v2.
 *
 * @param params - Order ID and gross amount in IDR.
 * @returns The charge result including the QRIS QR image URL.
 * @throws Error if the API call fails or returns an unexpected response.
 */
export async function createQrisCharge(params: CreateQrisChargeParams): Promise<QrisChargeResult> {
  const { orderId, grossAmount } = params;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v2/charge`;

  const requestBody = {
    payment_type: "qris",
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    qris: {
      acquirer: "gopay",
    },
  };

  log.info({ orderId, grossAmount }, "creating QRIS charge");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorBody = body as unknown as MidtransApiError;
    log.error(
      { statusCode: response.status, statusMessage: errorBody.statusMessage, orderId },
      "Midtrans QRIS charge failed",
    );
    throw new Error(
      `Midtrans QRIS charge failed: ${errorBody.statusMessage ?? response.statusText}`,
    );
  }

  // Extract the QR code URL from the actions array.
  const actions = body.actions as readonly { name: string; url: string }[] | undefined;
  const qrAction = actions?.find(
    (a) => a.name === "generate-qr-code" || a.name === "generate_qr_code",
  );

  if (qrAction === undefined) {
    log.error({ orderId, actions }, "Midtrans response missing QR code action");
    throw new Error("Midtrans QRIS response missing QR code URL");
  }

  const result: QrisChargeResult = {
    transactionId: String(body.transaction_id),
    orderId: String(body.order_id),
    transactionStatus: String(body.transaction_status),
    qrisUrl: qrAction.url,
  };

  log.info(
    { orderId, transactionId: result.transactionId, transactionStatus: result.transactionStatus },
    "QRIS charge created successfully",
  );

  return result;
}

/**
 * Get the status of a Midtrans transaction by order ID.
 *
 * @param orderId - The Midtrans order ID.
 * @returns The transaction status response.
 * @throws Error if the API call fails.
 */
export async function getTransactionStatus(orderId: string): Promise<MidtransTransactionStatus> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v2/${encodeURIComponent(orderId)}/status`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(),
    },
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorBody = body as unknown as MidtransApiError;
    log.error(
      { statusCode: response.status, statusMessage: errorBody.statusMessage, orderId },
      "Midtrans status check failed",
    );
    throw new Error(
      `Midtrans status check failed: ${errorBody.statusMessage ?? response.statusText}`,
    );
  }

  return body as unknown as MidtransTransactionStatus;
}
