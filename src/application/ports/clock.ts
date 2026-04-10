/**
 * Clock port — abstracts "what time is it now?" so use cases can be tested
 * deterministically without touching the real system clock.
 *
 * Use cases depend on this port instead of calling `new Date()` directly.
 * Infrastructure provides a `SystemClock` in production and tests provide a
 * `FakeClock`.
 */
export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};
