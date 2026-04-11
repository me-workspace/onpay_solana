/**
 * In-memory token-bucket rate limiter.
 *
 * Scope: per-process. Works fine for a single VPS or a single Vercel
 * serverless container. In multi-instance deploys the limits are
 * per-instance, not global — replace with Upstash Redis or a similar
 * distributed store when horizontal scaling matters. The interface
 * stays identical, so the swap is localized to this file.
 *
 * Algorithm: token bucket. Each key gets a bucket holding at most
 * `capacity` tokens. Tokens refill at `refillPerSecond` per second.
 * Every request consumes one token. If the bucket is empty, reject.
 *
 * This provides burst tolerance (a client can spike up to `capacity`
 * requests) with a sustained rate of `refillPerSecond`. Simple, well
 * understood, and doesn't require any external dependencies.
 */

export type RateLimitResult =
  | { readonly allowed: true; readonly remaining: number; readonly resetMs: number }
  | { readonly allowed: false; readonly remaining: 0; readonly resetMs: number };

export type RateLimitConfig = {
  /** Maximum tokens the bucket can hold (burst size). */
  readonly capacity: number;
  /** Token refill rate in tokens per second. */
  readonly refillPerSecond: number;
};

type Bucket = {
  tokens: number;
  lastRefillMs: number;
};

/**
 * A rate limiter keyed by arbitrary strings (IP, wallet, composite).
 * Each limiter instance owns its own map so you can run multiple
 * independently (e.g. per-IP AND per-wallet on the same endpoint).
 */
export function createRateLimiter(config: RateLimitConfig): {
  check(key: string): RateLimitResult;
  reset(key: string): void;
} {
  const buckets = new Map<string, Bucket>();
  const capacity = config.capacity;
  const refillPerMs = config.refillPerSecond / 1000;

  // Periodically drop stale buckets so the map doesn't grow unbounded
  // across the process lifetime. Runs once every 5 minutes.
  const cleanupIntervalMs = 5 * 60 * 1000;
  const staleThresholdMs = 10 * 60 * 1000;
  if (typeof globalThis.setInterval === "function") {
    const timer = globalThis.setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (now - bucket.lastRefillMs > staleThresholdMs) {
          buckets.delete(key);
        }
      }
    }, cleanupIntervalMs);
    // Don't keep the Node process alive just for this interval.
    if (typeof (timer as unknown as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = { tokens: capacity, lastRefillMs: now };
        buckets.set(key, bucket);
      } else {
        // Refill proportional to elapsed time since last check, clamped to capacity.
        const elapsed = now - bucket.lastRefillMs;
        const refill = elapsed * refillPerMs;
        bucket.tokens = Math.min(capacity, bucket.tokens + refill);
        bucket.lastRefillMs = now;
      }

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        const remaining = Math.floor(bucket.tokens);
        // Time until the bucket is full again — useful for Retry-After hints.
        const resetMs = Math.ceil((capacity - bucket.tokens) / refillPerMs);
        return { allowed: true, remaining, resetMs };
      }

      // Not enough tokens. Tell the caller when they can try again.
      const needed = 1 - bucket.tokens;
      const resetMs = Math.ceil(needed / refillPerMs);
      return { allowed: false, remaining: 0, resetMs };
    },

    reset(key: string): void {
      buckets.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Shared limiter instances.
// Defined at module scope so all requests share the same buckets.
// ---------------------------------------------------------------------------

/**
 * Strict limiter for auth flow endpoints — prevent brute-force guessing.
 * 10 req / min per key, burst up to 10.
 */
export const authRateLimiter = createRateLimiter({
  capacity: 10,
  refillPerSecond: 10 / 60,
});

/**
 * Medium limiter for mutation endpoints (merchants, invoices).
 * 60 req / min per key, burst up to 20.
 */
export const mutationRateLimiter = createRateLimiter({
  capacity: 20,
  refillPerSecond: 60 / 60,
});

/**
 * Loose limiter for the public Solana Pay endpoint (GET+POST /api/tx/[ref]).
 * Hit by wallets scanning QR codes, so it needs higher burst tolerance.
 * 120 req / min per key.
 */
export const txRateLimiter = createRateLimiter({
  capacity: 60,
  refillPerSecond: 120 / 60,
});
