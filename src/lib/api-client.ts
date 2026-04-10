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
// Merchants
// ---------------------------------------------------------------------------
export type UpsertMerchantBody = {
  readonly walletAddress: string;
  readonly businessName?: string | null;
  readonly settlementMint?: string;
  readonly preferredLanguage?: "en" | "id";
};

export function upsertMerchantApi(body: UpsertMerchantBody): Promise<MerchantApi> {
  return apiFetch<MerchantApi>("/api/merchants", { method: "POST", body });
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export type CreateInvoiceBody = {
  readonly merchantWallet: string;
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
