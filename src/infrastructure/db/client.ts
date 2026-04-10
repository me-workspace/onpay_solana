/**
 * Drizzle + postgres-js database client.
 *
 * Uses `postgres` (porsager/postgres) as the driver. This choice is
 * deliberate:
 *
 * - Small footprint, pure JS, no native bindings.
 * - Built-in connection pooling with sensible serverless defaults.
 * - Works with ANY PostgreSQL provider — Neon, Railway, Vercel Postgres,
 *   RDS, self-hosted, local. Zero vendor lock-in.
 * - Efficient with prepared statements (configurable).
 *
 * We expose a single lazily-initialized `getDb()` helper so that the
 * connection pool is created exactly once per Node process. Importing
 * this module from a client bundle is forbidden (it would leak
 * `DATABASE_URL`). A `typeof window` guard enforces this at runtime.
 *
 * On Vercel/serverless: connection pools should be small (<=5) because
 * each function instance has its own pool. For traditional long-running
 * servers, 10-20 is fine. We default to 5 — safe baseline.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/config/env.server";

import * as schema from "./schema";

export type Database = ReturnType<typeof buildDrizzle>;

let instance: Database | null = null;
let rawClient: ReturnType<typeof postgres> | null = null;

/**
 * Build the drizzle instance. Not exported — callers use `getDb()`.
 */
function buildDrizzle(): ReturnType<typeof drizzle<typeof schema>> {
  if (typeof window !== "undefined") {
    throw new Error("Database client must never be constructed in client code");
  }
  const client = postgres(serverEnv.DATABASE_URL, {
    // Connection pool size. Small for serverless; raise for long-lived servers.
    max: serverEnv.DATABASE_POOL_MAX,
    // Close idle connections after this many seconds.
    idle_timeout: 20,
    // Give up establishing a new connection after this many seconds.
    connect_timeout: 10,
    // Disable prepared statements for maximum compatibility with pgbouncer
    // transaction-mode poolers (e.g. Supabase, Neon). No measurable perf loss
    // for the kinds of queries OnPay runs.
    prepare: false,
  });
  rawClient = client;
  return drizzle(client, { schema });
}

/**
 * Returns the singleton drizzle database instance.
 * Safe to call from any server-side module.
 */
export function getDb(): Database {
  if (instance === null) {
    instance = buildDrizzle();
  }
  return instance;
}

/**
 * Ping the database with `SELECT 1`.
 * Used by the /api/health endpoint to verify connectivity.
 */
export async function pingDatabase(): Promise<void> {
  getDb();
  if (rawClient === null) {
    throw new Error("Database client not initialized");
  }
  await rawClient`SELECT 1`;
}
