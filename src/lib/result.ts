/**
 * Result<T, E> — a discriminated union for fail-safe error handling.
 *
 * Why not just throw? Two reasons:
 *
 * 1. **Exhaustiveness.** Returning errors forces the caller to handle them.
 *    Thrown errors are invisible in the type system and frequently forgotten.
 * 2. **Determinism.** In domain/application code, errors are values. Treating
 *    them as values makes code easier to reason about, test, and audit.
 *
 * Use `throw` only for truly exceptional conditions (invariant violations,
 * programmer errors). Use Result for anything a caller might reasonably
 * want to handle — validation failures, missing records, network errors.
 *
 * @example
 * ```ts
 * function parseAmount(input: string): Result<number, "invalid" | "negative"> {
 *   const n = Number(input);
 *   if (Number.isNaN(n)) return err("invalid");
 *   if (n < 0) return err("negative");
 *   return ok(n);
 * }
 *
 * const r = parseAmount("42");
 * if (isOk(r)) console.log(r.value);
 * else console.error(r.error);
 * ```
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

/** Construct a successful Result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Construct a failed Result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard for successful Results. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard for failed Results. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Unwrap a successful Result or throw if it's an error.
 * Use sparingly — the whole point of Result is to avoid throwing.
 * Appropriate only at the very top of a call stack where errors are unexpected.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`Called unwrap() on an Err Result: ${JSON.stringify(result.error)}`);
}

/**
 * Unwrap with a fallback value if the Result is an error.
 * Safer than `unwrap()` — never throws.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Transform the Ok value of a Result with a pure function.
 * If the Result is Err, it passes through unchanged.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Chain Results together — feed the Ok value of one Result into a function
 * that returns another Result. Short-circuits on the first Err.
 */
export function flatMap<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Transform the Err value of a Result.
 * Useful for mapping low-level errors into domain errors at layer boundaries.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Convert a Promise that may reject into a Result.
 * Rejections are caught and mapped via the provided error mapper.
 */
export async function tryAsync<T, E>(
  promise: Promise<T>,
  mapError: (cause: unknown) => E,
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (cause) {
    return err(mapError(cause));
  }
}

/**
 * Convert a synchronous function that may throw into a Result.
 */
export function trySync<T, E>(fn: () => T, mapError: (cause: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(mapError(cause));
  }
}
