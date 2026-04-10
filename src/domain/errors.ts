/**
 * Typed domain errors.
 *
 * Every use case in `src/application` returns `Result<T, DomainError>`.
 * Errors are values, not thrown exceptions, so they are exhaustive and safe
 * to handle at the boundary layer (API routes, UI components).
 *
 * Add new kinds sparingly — each new kind forces every call site to handle
 * it. That is by design.
 */

export type DomainErrorKind =
  /** Request payload failed validation (Zod, business rules, etc.). */
  | "VALIDATION_FAILED"
  /** The caller is not allowed to perform this action. */
  | "UNAUTHORIZED"
  /** The caller is authenticated but lacks permission. */
  | "FORBIDDEN"
  /** The referenced record does not exist. */
  | "NOT_FOUND"
  /** The operation conflicts with the current state (duplicate, etc.). */
  | "CONFLICT"
  /** The resource has expired and cannot be used anymore. */
  | "EXPIRED"
  /** The rate limit has been exceeded. */
  | "RATE_LIMITED"
  /** An upstream dependency (RPC, Jupiter, Supabase) failed. */
  | "UPSTREAM_FAILURE"
  /** An unexpected internal error. Usually a programmer bug. */
  | "INTERNAL_ERROR";

export type DomainError = {
  readonly kind: DomainErrorKind;
  readonly message: string;
  readonly details?: unknown;
  readonly cause?: unknown;
};

/** Factory for DomainError values. */
export function domainError(
  kind: DomainErrorKind,
  message: string,
  options?: { details?: unknown; cause?: unknown },
): DomainError {
  const base: DomainError = { kind, message };
  if (options?.details !== undefined) {
    return { ...base, details: options.details };
  }
  if (options?.cause !== undefined) {
    return { ...base, cause: options.cause };
  }
  return base;
}
