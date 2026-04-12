/**
 * OnPay SDK client.
 *
 * Provides typed methods for interacting with the OnPay REST API. All methods
 * return promises that resolve to the parsed JSON response, or reject with an
 * `OnPayError` on non-2xx responses.
 *
 * @example
 * ```ts
 * import { OnPay } from "@onpay/node";
 *
 * const onpay = new OnPay({ secretKey: "sk_live_..." });
 * const invoice = await onpay.invoices.create({ amountDecimal: "12.50" });
 * ```
 *
 * @module
 */
import { OnPayError } from "./errors.js";
import type {
  CreateInvoiceParams,
  CreateWebhookEndpointParams,
  DeleteResponse,
  Invoice,
  ListInvoicesParams,
  ListInvoicesResponse,
  Merchant,
  RequestOptions,
  UpdateMerchantParams,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "./types.js";
import { constructEvent } from "./webhooks.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base URL for the OnPay API. */
const DEFAULT_BASE_URL = "https://onpay.id";

/** API version sent with every request. */
const API_VERSION = "2026-04-12";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Options for constructing an OnPay client. */
export interface OnPayConfig {
  /** Your secret API key (starts with `sk_live_` or `sk_test_`). */
  readonly secretKey: string;
  /** Base URL of the OnPay API. Defaults to `https://onpay.id`. */
  readonly baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a non-2xx response body and throw an `OnPayError`.
 *
 * Attempts to parse the body as JSON matching the OnPay error shape
 * (`{ code, message, details? }`). Falls back to a generic error if
 * the body is not valid JSON.
 */
async function throwApiError(response: Response): Promise<never> {
  let code = "UNKNOWN_ERROR";
  let message = `HTTP ${String(response.status)}`;
  let details: unknown;

  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const obj = body as Record<string, unknown>;
      if (typeof obj["code"] === "string") {
        code = obj["code"];
      }
      if (typeof obj["message"] === "string") {
        message = obj["message"];
      }
      if ("details" in obj) {
        details = obj["details"];
      }
    }
  } catch {
    // Body is not JSON — use the generic message.
  }

  throw new OnPayError(response.status, code, message, details);
}

// ---------------------------------------------------------------------------
// Resource namespaces
// ---------------------------------------------------------------------------

/**
 * Invoice operations.
 *
 * Access via `onpay.invoices`.
 */
class InvoiceResource {
  constructor(private readonly _request: OnPay["_request"]) {}

  /**
   * Create a new invoice.
   *
   * @param params  - Invoice creation parameters.
   * @param options - Optional request options (e.g. idempotency key).
   * @returns The created invoice.
   */
  async create(params: CreateInvoiceParams, options?: RequestOptions): Promise<Invoice> {
    return this._request<Invoice>("POST", "/api/invoices", {
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * Retrieve a single invoice by ID.
   *
   * @param id - The invoice UUID.
   * @returns The invoice.
   */
  async retrieve(id: string): Promise<Invoice> {
    return this._request<Invoice>("GET", `/api/invoices/${encodeURIComponent(id)}`);
  }

  /**
   * List invoices for the authenticated merchant.
   *
   * @param params - Optional filtering and pagination parameters.
   * @returns Paginated list of invoices.
   */
  async list(params?: ListInvoicesParams): Promise<ListInvoicesResponse> {
    const query = new URLSearchParams();
    if (params?.status !== undefined) {
      query.set("status", params.status);
    }
    if (params?.limit !== undefined) {
      query.set("limit", String(params.limit));
    }
    if (params?.offset !== undefined) {
      query.set("offset", String(params.offset));
    }
    const qs = query.toString();
    const path = qs.length > 0 ? `/api/invoices?${qs}` : "/api/invoices";
    return this._request<ListInvoicesResponse>("GET", path);
  }
}

/**
 * Merchant operations.
 *
 * Access via `onpay.merchants`.
 */
class MerchantResource {
  constructor(private readonly _request: OnPay["_request"]) {}

  /**
   * Retrieve the authenticated merchant's profile.
   *
   * @returns The merchant profile.
   */
  async retrieve(): Promise<Merchant> {
    return this._request<Merchant>("GET", "/api/merchants");
  }

  /**
   * Update (upsert) the authenticated merchant's profile.
   *
   * @param params - Fields to update.
   * @returns The updated merchant profile.
   */
  async update(params: UpdateMerchantParams): Promise<Merchant> {
    return this._request<Merchant>("POST", "/api/merchants", { body: params });
  }
}

/**
 * Webhook endpoint operations.
 *
 * Access via `onpay.webhookEndpoints`.
 */
class WebhookEndpointResource {
  constructor(private readonly _request: OnPay["_request"]) {}

  /**
   * Create a new webhook endpoint.
   *
   * The response includes the signing `secret`, which is only shown once.
   *
   * @param params  - Webhook endpoint creation parameters.
   * @param options - Optional request options (e.g. idempotency key).
   * @returns The created webhook endpoint with its signing secret.
   */
  async create(
    params: CreateWebhookEndpointParams,
    options?: RequestOptions,
  ): Promise<WebhookEndpointWithSecret> {
    return this._request<WebhookEndpointWithSecret>("POST", "/api/webhooks", {
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * List all webhook endpoints for the authenticated merchant.
   *
   * @returns Object containing the array of endpoints.
   */
  async list(): Promise<{ endpoints: readonly WebhookEndpoint[] }> {
    return this._request<{ endpoints: readonly WebhookEndpoint[] }>("GET", "/api/webhooks");
  }

  /**
   * Delete a webhook endpoint.
   *
   * @param id - The webhook endpoint UUID.
   * @returns Confirmation object with `ok` and `id`.
   */
  async delete(id: string): Promise<DeleteResponse> {
    return this._request<DeleteResponse>("DELETE", `/api/webhooks/${encodeURIComponent(id)}`);
  }
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

/**
 * OnPay API client.
 *
 * Create an instance with your secret API key and use the resource
 * namespaces (`invoices`, `merchants`, `webhookEndpoints`) to interact
 * with the API.
 *
 * @example
 * ```ts
 * const onpay = new OnPay({ secretKey: "sk_live_..." });
 * const invoice = await onpay.invoices.create({ amountDecimal: "10.00" });
 * ```
 */
export class OnPay {
  private readonly _secretKey: string;
  private readonly _baseUrl: string;

  /** Invoice operations. */
  public readonly invoices: InvoiceResource;
  /** Merchant operations. */
  public readonly merchants: MerchantResource;
  /** Webhook endpoint operations. */
  public readonly webhookEndpoints: WebhookEndpointResource;

  /**
   * Static webhook utilities. Use `OnPay.webhooks.constructEvent()` to
   * verify incoming webhook signatures without instantiating a client.
   */
  static readonly webhooks = {
    /**
     * Verify a webhook signature and parse the event body.
     *
     * @param rawBody         - The raw request body as a string.
     * @param signatureHeader - The value of the `OnPay-Signature` header.
     * @param endpointSecret  - The webhook endpoint's signing secret.
     * @param tolerance       - Maximum age in seconds (default: 300).
     * @returns The parsed webhook event body.
     * @throws {OnPayWebhookError} If verification fails.
     */
    constructEvent,
  };

  constructor(config: OnPayConfig) {
    if (!config.secretKey) {
      throw new Error(
        "OnPay: secretKey is required. Pass your API key when constructing the client.",
      );
    }

    this._secretKey = config.secretKey;
    this._baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

    // Bind the request method so resource classes can call it.
    const boundRequest = this._request.bind(this);
    this.invoices = new InvoiceResource(boundRequest);
    this.merchants = new MerchantResource(boundRequest);
    this.webhookEndpoints = new WebhookEndpointResource(boundRequest);
  }

  /**
   * Internal method that executes an HTTP request against the OnPay API.
   *
   * All resource methods delegate to this. It handles headers, JSON
   * serialization, and error mapping.
   *
   * @internal
   */
  async _request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options?: {
      body?: unknown;
      idempotencyKey?: string;
    },
  ): Promise<T> {
    const url = `${this._baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._secretKey}`,
      "OnPay-Version": API_VERSION,
    };

    if (options?.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let bodyStr: string | undefined;
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });

    if (!response.ok) {
      await throwApiError(response);
    }

    return (await response.json()) as T;
  }
}
