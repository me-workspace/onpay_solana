/**
 * Runtime assertions for conditions that MUST be true.
 *
 * Invariants are the opposite of Results: they are for programmer errors and
 * bugs that indicate a broken assumption. If an invariant is violated, the
 * system is in an undefined state and should crash loudly rather than
 * continue silently with bad data.
 *
 * Do not use invariants for user input validation — use Zod at the API
 * boundary and return Result for domain validation. Invariants are for things
 * like "at this point in the code, this value must be non-null because we
 * already checked it upstream." They make the type system narrower without
 * hiding real failure modes.
 *
 * In production builds, the assertion message is preserved so Sentry/logs
 * can show what went wrong.
 */

export class InvariantError extends Error {
  public override readonly name = "InvariantError";

  constructor(message: string) {
    super(`Invariant violated: ${message}`);
  }
}

/**
 * Assert that a condition is true. If false, throws an `InvariantError`.
 *
 * @example
 * ```ts
 * const user = await db.users.findById(id);
 * invariant(user !== null, `User ${id} should exist at this point`);
 * // TypeScript now knows user is non-null.
 * ```
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (
    condition === false ||
    condition === null ||
    condition === undefined ||
    condition === 0 ||
    condition === ""
  ) {
    throw new InvariantError(message);
  }
}

/**
 * Narrower version of `invariant` for explicit non-null checks.
 * Preserves type narrowing without coercing truthy/falsy.
 */
export function invariantNonNull<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new InvariantError(message);
  }
}

/**
 * Mark an unreachable code path. Useful for exhaustiveness checks on unions.
 *
 * @example
 * ```ts
 * switch (status) {
 *   case "pending": return handlePending();
 *   case "paid": return handlePaid();
 *   default: unreachable(status);
 * }
 * ```
 */
export function unreachable(value: never): never {
  throw new InvariantError(`Unreachable code reached with value: ${JSON.stringify(value)}`);
}
