import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows requests up to the bucket capacity immediately", () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("rejects requests once the bucket is empty", () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1 });
    limiter.check("a");
    limiter.check("a");
    const denied = limiter.check("a");
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetMs).toBeGreaterThan(0);
  });

  it("isolates keys from one another", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    // Separate key has its own bucket.
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("reset(key) lets a blocked client through immediately", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1 });
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("refills over time (simulated)", async () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1000 });
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    // Sleep ~5ms — at 1000 tokens/sec, that's well over 1 token.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(limiter.check("a").allowed).toBe(true);
  });
});
