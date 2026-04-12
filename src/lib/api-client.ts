/**
 * Typed client for OnPay's own API.
 *
 * Lives in `lib/` because it's used from both server and client components.
 * Keeps fetch calls out of the React layer, so components stay focused on
 * rendering and we have one place to update if the API contract changes.
 *
 * Throws an `ApiClientError` on any non-2xx response so callers can branch
 * on `instanceof` cleanly.
 */

export type MerchantApi = {
  readonly id: string;
  readonly walletAddress: string;
  readonly businessName: string | null;
  readonly settlementMint: string;
  readonly preferredLanguage: "en" | "id";
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type InvoiceApi = {
  readonly id: string;
  readonly reference: string;
  readonly merchantId: string;
  readonly amount: {
    readonly raw: string;
    readonly formatted: string;
    readonly currency: string;
    readonly decimals: number;
  };
  readonly label: string | null;
  readonly memo: string | null;
  readonly status: "pending" | "paid" | "expired" | "failed";
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly paymentUrl: string;
  readonly qris?: {
    readonly qrisUrl: string;
    readonly grossAmountIdr: number;
    readonly status: string;
  } | null;
};

export type ApiErrorBody = {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
};

export class ApiClientError extends Error {
  public override readonly name = "ApiClientError";
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
  }
}

async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  // Build RequestInit conditionally so we never assign `undefined` to a key
  // that demands a defined value (exactOptionalPropertyTypes-strict).
  const requestInit: RequestInit = {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", accept: "application/json" },
    cache: "no-store",
    // Send the session cookie on every request so the server can read it.
    credentials: "same-origin",
  };
  if (init?.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }
  if (init?.signal !== undefined) {
    requestInit.signal = init.signal;
  }
  const response = await fetch(path, requestInit);

  if (!response.ok) {
    let errorBody: ApiErrorBody;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      errorBody = { code: "UNKNOWN", message: `HTTP ${String(response.status)}` };
    }
    throw new ApiClientError(response.status, errorBody);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export type NonceResponse = {
  readonly message: string;
  readonly challenge: string;
};

export function requestNonceApi(walletAddress: string): Promise<NonceResponse> {
  return apiFetch<NonceResponse>("/api/auth/nonce", {
    method: "POST",
    body: { walletAddress },
  });
}

export type VerifyBody = {
  readonly walletAddress: string;
  readonly challenge: string;
  /** Base64-encoded 64-byte ed25519 signature. */
  readonly signature: string;
};

export function verifyAuthApi(body: VerifyBody): Promise<{ ok: true; wallet: string }> {
  return apiFetch<{ ok: true; wallet: string }>("/api/auth/verify", {
    method: "POST",
    body,
  });
}

export function logoutApi(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------
export type UpsertMerchantBody = {
  readonly businessName?: string | null;
  readonly settlementMint?: string;
  readonly preferredLanguage?: "en" | "id";
};

export function upsertMerchantApi(body: UpsertMerchantBody = {}): Promise<MerchantApi> {
  return apiFetch<MerchantApi>("/api/merchants", { method: "POST", body });
}

export function getMerchantMeApi(signal?: AbortSignal): Promise<MerchantApi> {
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<MerchantApi>("/api/merchants", init);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export type StatCard = {
  readonly label: string;
  readonly totalFormatted: string;
  readonly totalRaw: string;
  readonly count: number;
};

export type StatsResponse = {
  readonly currency: string;
  readonly today: StatCard;
  readonly week: StatCard;
  readonly month: StatCard;
};

export function getMerchantStatsApi(signal?: AbortSignal): Promise<StatsResponse> {
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<StatsResponse>("/api/merchants/me/stats", init);
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export type ApiKeyApi = {
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
};

export type ListApiKeysResponse = {
  readonly keys: readonly ApiKeyApi[];
};

export type CreateApiKeyBody = {
  readonly name: string;
  readonly keyType: "publishable" | "secret";
  readonly mode: "live" | "test";
  readonly scopes?: readonly string[];
};

export type CreateApiKeyResponse = ApiKeyApi & {
  /** The full raw key — shown once, never again. Store it securely. */
  readonly rawKey: string;
};

export function listApiKeysApi(signal?: AbortSignal): Promise<ListApiKeysResponse> {
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<ListApiKeysResponse>("/api/keys", init);
}

export function createApiKeyApi(body: CreateApiKeyBody): Promise<CreateApiKeyResponse> {
  return apiFetch<CreateApiKeyResponse>("/api/keys", { method: "POST", body });
}

export function revokeApiKeyApi(id: string): Promise<{ ok: true; id: string }> {
  return apiFetch<{ ok: true; id: string }>(`/api/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEndpointApi = {
  readonly id: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: string;
};

export type ListWebhookEndpointsResponse = {
  readonly endpoints: readonly WebhookEndpointApi[];
};

export type CreateWebhookEndpointBody = {
  readonly url: string;
  readonly events: readonly string[];
};

export type CreateWebhookEndpointResponse = WebhookEndpointApi & {
  /** The signing secret — shown once, never again. Store it securely. */
  readonly secret: string;
};

export type WebhookDeliveryApi = {
  readonly id: string;
  readonly eventType: string;
  readonly httpStatus: number | null;
  readonly responseBody: string | null;
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
};

export type ListWebhookDeliveriesResponse = {
  readonly deliveries: readonly WebhookDeliveryApi[];
};

export function listWebhookEndpointsApi(
  signal?: AbortSignal,
): Promise<ListWebhookEndpointsResponse> {
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<ListWebhookEndpointsResponse>("/api/webhooks", init);
}

export function createWebhookEndpointApi(
  body: CreateWebhookEndpointBody,
): Promise<CreateWebhookEndpointResponse> {
  return apiFetch<CreateWebhookEndpointResponse>("/api/webhooks", { method: "POST", body });
}

export function deleteWebhookEndpointApi(id: string): Promise<{ ok: true; id: string }> {
  return apiFetch<{ ok: true; id: string }>(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listWebhookDeliveriesApi(
  endpointId: string,
  signal?: AbortSignal,
): Promise<ListWebhookDeliveriesResponse> {
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<ListWebhookDeliveriesResponse>(
    `/api/webhooks/${encodeURIComponent(endpointId)}`,
    init,
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export type CreateInvoiceBody = {
  readonly amountDecimal: string;
  readonly currency?: string;
  readonly label?: string | null;
  readonly memo?: string | null;
};

export function createInvoiceApi(body: CreateInvoiceBody): Promise<InvoiceApi> {
  return apiFetch<InvoiceApi>("/api/invoices", { method: "POST", body });
}

export function getInvoiceApi(id: string, signal?: AbortSignal): Promise<InvoiceApi> {
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<InvoiceApi>(`/api/invoices/${encodeURIComponent(id)}`, init);
}

export type ListInvoicesResponse = {
  readonly invoices: readonly InvoiceApi[];
  readonly limit: number;
  readonly offset: number;
};

export type ListInvoicesQuery = {
  readonly status?: "pending" | "paid" | "expired" | "failed";
  readonly limit?: number;
  readonly offset?: number;
};

export function listInvoicesApi(
  query: ListInvoicesQuery = {},
  signal?: AbortSignal,
): Promise<ListInvoicesResponse> {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.set("status", query.status);
  if (query.limit !== undefined) params.set("limit", query.limit.toString());
  if (query.offset !== undefined) params.set("offset", query.offset.toString());
  const qs = params.toString();
  const path = qs.length > 0 ? `/api/invoices?${qs}` : "/api/invoices";
  const init = signal !== undefined ? { signal } : undefined;
  return apiFetch<ListInvoicesResponse>(path, init);
}
