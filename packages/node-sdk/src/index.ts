/**
 * @onpay/node — Node.js SDK for the OnPay Solana payment gateway.
 *
 * @example
 * ```ts
 * import { OnPay } from "@onpay/node";
 *
 * const onpay = new OnPay({ secretKey: "sk_live_..." });
 *
 * // Create an invoice
 * const invoice = await onpay.invoices.create({
 *   amountDecimal: "25.00",
 *   currency: "USD",
 *   label: "Order #1234",
 * });
 *
 * // Verify a webhook
 * const event = OnPay.webhooks.constructEvent(rawBody, sigHeader, secret);
 * ```
 *
 * @module
 */

// Re-export the main client class.
export { OnPay } from "./client.js";
export type { OnPayConfig } from "./client.js";

// Re-export error classes and type guard.
export { OnPayError, OnPayWebhookError, isOnPayError } from "./errors.js";

// Re-export webhook utilities for direct access.
export { constructEvent } from "./webhooks.js";

// Re-export all types.
export type {
  Invoice,
  InvoiceAmount,
  CreateInvoiceParams,
  ListInvoicesParams,
  ListInvoicesResponse,
  Merchant,
  UpdateMerchantParams,
  ApiKey,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  CreateWebhookEndpointParams,
  WebhookDelivery,
  WebhookEvent,
  RequestOptions,
  DeleteResponse,
} from "./types.js";
