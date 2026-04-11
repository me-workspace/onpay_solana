/**
 * Empty stub for the `server-only` package.
 *
 * `server-only` is a tiny package that throws on import to prevent its
 * enclosing module from being bundled into a client chunk. Vitest runs
 * in plain Node and trips that guard, so we alias it to this no-op file
 * in vitest.config.ts.
 */
export {};
