/**
 * Typed HTTP errors for API routes.
 *
 * Every API route should return well-formed JSON error responses with a
 * consistent shape. Never leak internal errors, stack traces, or framework
 * details to clients. The `ApiError` class formalizes this contract and the
 * `toJsonResponse` helper maps it to a `NextResponse`.
 *
 * Client-facing errors are intentionally generic. Detailed context is logged
 * server-side.
 *
 * @example
 * ```ts
 * export async function POST(req: NextRequest) {
 *   const body = await req.json().catch(() => null);
 *   const parsed = CreateInvoiceSchema.safeParse(body);
 *   if (!parsed.success) {
 *     return apiError("INVALID_REQUEST", "Request body is invalid", {
 *       status: 400,
 *       details: parsed.error.flatten(),
 *     }).toJsonResponse();
 *   }
 *   // ...
 * }
 * ```
 */
import { NextResponse } from "next/server";

/** Stable, machine-readable error codes. Add new codes here. */
export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "GONE"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UPSTREAM_FAILURE"
  | "INTERNAL_ERROR";

/** HTTP status code for each error code. */
const STATUS_MAP: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPSTREAM_FAILURE: 502,
  INTERNAL_ERROR: 500,
};

export type ApiErrorBody = {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: unknown;
};

export class ApiError extends Error {
  public override readonly name = "ApiError";
  public readonly code: ApiErrorCode;
  public readonly status: number;
  public readonly details?: unknown;
  /** Extra HTTP headers to include on the error response (e.g. Retry-After). */
  public readonly responseHeaders?: Record<string, string>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: {
      status?: number;
      details?: unknown;
      cause?: unknown;
      headers?: Record<string, string>;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.status = options?.status ?? STATUS_MAP[code];
    if (options?.details !== undefined) {
      this.details = options.details;
    }
    if (options?.headers !== undefined) {
      this.responseHeaders = options.headers;
    }
  }

  /** Convert to the JSON body that will be returned to the client. */
  toBody(): ApiErrorBody {
    const body: ApiErrorBody = {
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) {
      return { ...body, details: this.details };
    }
    return body;
  }

  /** Convert to a NextResponse with the correct status and body. */
  toJsonResponse(): NextResponse<ApiErrorBody> {
    const response = NextResponse.json(this.toBody(), { status: this.status });
    if (this.responseHeaders !== undefined) {
      for (const [key, value] of Object.entries(this.responseHeaders)) {
        response.headers.set(key, value);
      }
    }
    return response;
  }
}

/** Convenience factory — avoids `new` noise at call sites. */
export function apiError(
  code: ApiErrorCode,
  message: string,
  options?: {
    status?: number;
    details?: unknown;
    cause?: unknown;
    headers?: Record<string, string>;
  },
): ApiError {
  return new ApiError(code, message, options);
}
