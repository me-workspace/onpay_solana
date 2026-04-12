/**
 * Type definitions for the OnPay Node.js SDK.
 *
 * All types mirror the exact JSON shapes returned by the OnPay REST API.
 * Dates are serialized as ISO 8601 strings.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

/** Amount breakdown as returned by the API. */
export interface InvoiceAmount {
  /** Raw decimal string, e.g. "12.50". */
  readonly raw: string;
  /** Human-readable formatted string, e.g. "$12.50". */
  readonly formatted: string;
  /** ISO 4217 currency code, e.g. "USD". */
  readonly currency: string;
  /** Number of decimal places for this currency. */
  readonly decimals: number;
}

/** An OnPay invoice. */
export interface Invoice {
  readonly id: string;
  readonly reference: string;
  readonly merchantId: string;
  readonly amount: InvoiceAmount;
  readonly label: string | null;
  readonly memo: string | null;
  readonly status: "pending" | "paid" | "expired" | "failed";
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly paymentUrl: string;
}

/** Parameters for creating an invoice. */
export interface CreateInvoiceParams {
  /** Decimal amount as a string, e.g. "12.50". */
  readonly amountDecimal: string;
  /** ISO 4217 currency code. Defaults to "USD". */
  readonly currency?: string;
  /** Optional label shown to the payer. */
  readonly label?: string | null;
  /** Optional memo attached to the invoice. */
  readonly memo?: string | null;
}

/** Parameters for listing invoices. */
export interface ListInvoicesParams {
  /** Filter by invoice status. */
  readonly status?: "pending" | "paid" | "expired" | "failed";
  /** Maximum number of results (1-100). Defaults to 20. */
  readonly limit?: number;
  /** Offset for pagination. Defaults to 0. */
  readonly offset?: number;
}

/** Response shape for invoice list. */
export interface ListInvoicesResponse {
  readonly invoices: readonly Invoice[];
  readonly limit: number;
  readonly offset: number;
}

// ---------------------------------------------------------------------------
// Merchant
// ---------------------------------------------------------------------------

/** An OnPay merchant profile. */
export interface Merchant {
  readonly id: string;
  readonly walletAddress: string;
  readonly businessName: string | null;
  readonly settlementMint: string;
  readonly preferredLanguage: "en" | "id";
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Parameters for updating a merchant profile. */
export interface UpdateMerchantParams {
  readonly businessName?: string | null;
  readonly settlementMint?: string;
  readonly preferredLanguage?: "en" | "id";
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

/** An API key (list view, never includes raw key or hash). */
export interface ApiKey {
  readonly id: string;
  readonly name: string;
  readonly keyType: "publishable" | "secret";
  readonly keyPrefix: string;
  readonly keyHint: string;
  readonly mode: "live" | "test";
  readonly scopes: readonly string[];
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

// ---------------------------------------------------------------------------
// Webhook Endpoint
// ---------------------------------------------------------------------------

/** A webhook endpoint configuration. */
export interface WebhookEndpoint {
  readonly id: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: string;
}

/** Webhook endpoint as returned by the create endpoint (includes secret). */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** The signing secret. Only returned once at creation time. */
  readonly secret: string;
}

/** Parameters for creating a webhook endpoint. */
export interface CreateWebhookEndpointParams {
  /** The HTTPS URL to receive webhook events. */
  readonly url: string;
  /** Event types to subscribe to. */
  readonly events: readonly string[];
}

// ---------------------------------------------------------------------------
// Webhook Delivery
// ---------------------------------------------------------------------------

/** A webhook delivery record. */
export interface WebhookDelivery {
  readonly id: string;
  readonly eventType: string;
  readonly httpStatus: number | null;
  readonly responseBody: string | null;
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Webhook Event (parsed from incoming webhook payload)
// ---------------------------------------------------------------------------

/** A parsed webhook event. */
export interface WebhookEvent {
  /** The raw parsed JSON body. */
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------

/** Options for mutating API calls. */
export interface RequestOptions {
  /** Idempotency key for safe retries. */
  readonly idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Delete response
// ---------------------------------------------------------------------------

/** Response shape for delete operations. */
export interface DeleteResponse {
  readonly ok: true;
  readonly id: string;
}
