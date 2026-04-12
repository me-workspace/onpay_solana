/**
 * Error types for the OnPay Node.js SDK.
 *
 * All non-2xx API responses are thrown as `OnPayError` instances. Webhook
 * signature verification failures throw `OnPayWebhookError`.
 *
 * @module
 */

/**
 * Error thrown when an OnPay API call returns a non-2xx response.
 *
 * The `status`, `code`, and `message` fields correspond to the JSON error
 * body returned by the API. The optional `details` field carries any
 * additional context (e.g. validation error breakdowns).
 */
export class OnPayError extends Error {
  public override readonly name = "OnPayError";

  /** HTTP status code from the response. */
  public readonly status: number;

  /** Machine-readable error code from the API (e.g. "INVALID_REQUEST"). */
  public readonly code: string;

  /** Additional error context, if any. */
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Type guard to check if an unknown error is an `OnPayError`.
 *
 * @param err - The value to check.
 * @returns `true` if `err` is an instance of `OnPayError`.
 */
export function isOnPayError(err: unknown): err is OnPayError {
  return err instanceof OnPayError;
}

/**
 * Error thrown when webhook signature verification fails.
 *
 * This may indicate a tampered payload, an expired timestamp, or a
 * mismatched signing secret.
 */
export class OnPayWebhookError extends Error {
  public override readonly name = "OnPayWebhookError";

  constructor(message: string) {
    super(message);
  }
}
