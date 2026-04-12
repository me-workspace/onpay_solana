/**
 * API key generation utilities.
 *
 * Generates cryptographically secure API keys for merchants. Keys follow
 * a prefix convention that makes them easy to identify:
 *
 *   - `pk_live_` / `pk_test_` — publishable keys (safe for client-side)
 *   - `sk_live_` / `sk_test_` — secret keys (server-side only)
 *
 * The raw key is shown to the merchant exactly once at creation time.
 * We store only the SHA-256 hash for lookup, plus the last 4 chars as
 * a display hint (e.g. `...abc1`).
 *
 * Key lengths:
 *   - Publishable: 32 random alphanumeric chars (~190 bits of entropy)
 *   - Secret: 48 random alphanumeric chars (~285 bits of entropy)
 */
import { createHash, randomBytes } from "node:crypto";

/** The two key types OnPay supports. */
export type ApiKeyType = "publishable" | "secret";

/** The two modes: live (real transactions) or test (sandbox). */
export type ApiKeyMode = "live" | "test";

/** Result of generating a new API key. */
export type GeneratedApiKey = {
  /** The full raw key — shown once, never stored. */
  readonly raw: string;
  /** SHA-256 hex digest of the raw key — stored in the database. */
  readonly hash: string;
  /** Last 4 characters of the raw key — for display (e.g. `...abc1`). */
  readonly hint: string;
  /** The prefix portion of the key (e.g. `pk_live_`). */
  readonly prefix: string;
};

/**
 * Alphanumeric charset for key generation. Avoids ambiguous characters
 * but keeps the set large enough for strong entropy.
 */
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a random alphanumeric string of the given length using
 * cryptographically secure random bytes.
 */
function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    const char = ALPHANUMERIC[byte % ALPHANUMERIC.length] ?? "a";
    chars.push(char);
  }
  return chars.join("");
}

/**
 * Compute the SHA-256 hex digest of a string.
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Build the key prefix string from type and mode.
 */
function buildPrefix(type: ApiKeyType, mode: ApiKeyMode): string {
  const typePrefix = type === "publishable" ? "pk" : "sk";
  return `${typePrefix}_${mode}_`;
}

/**
 * Generate a new API key with the given type and mode.
 *
 * @param type  - `"publishable"` (32 random chars) or `"secret"` (48 random chars)
 * @param mode  - `"live"` or `"test"`
 * @returns The generated key parts — raw (show once), hash (store), hint (display)
 */
export function generateApiKey(type: ApiKeyType, mode: ApiKeyMode): GeneratedApiKey {
  const prefix = buildPrefix(type, mode);
  const randomLength = type === "publishable" ? 32 : 48;
  const randomPart = randomAlphanumeric(randomLength);
  const raw = `${prefix}${randomPart}`;
  const hash = hashApiKey(raw);
  const hint = raw.slice(-4);

  return { raw, hash, hint, prefix };
}
