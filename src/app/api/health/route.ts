/**
 * Health check endpoint.
 *
 * Returns 200 with a JSON payload describing the status of each dependency.
 * This is intentionally more than a simple "OK" — it verifies that:
 *
 * - Env vars are loaded (implicit — importing this file triggers env.ts)
 * - Solana RPC is reachable
 * - Supabase is configured (not a live call, just config check)
 *
 * Use this endpoint from Vercel uptime monitoring and as a smoke test after
 * every deploy. It should NEVER leak secrets or internal details.
 */
import { NextResponse } from "next/server";

import { publicEnv, serverEnv } from "@/config/env";
import { createSolanaClient } from "@/infrastructure/solana/client";
import { logger } from "@/lib/logger";

// Important: this must run on the Node runtime (not Edge) because @solana/web3.js
// and pino depend on Node APIs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded";

type HealthComponent = {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
};

type HealthResponse = {
  readonly status: HealthStatus;
  readonly env: string;
  readonly cluster: string;
  readonly version: string;
  readonly timestamp: string;
  readonly components: readonly HealthComponent[];
};

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const startedAt = Date.now();

  const components: HealthComponent[] = [];

  // 1. Config sanity: Supabase is optional but we flag if it's missing.
  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL === undefined) {
    components.push({
      name: "supabase",
      status: "degraded",
      message: "Supabase URL not configured",
    });
  } else {
    components.push({ name: "supabase", status: "ok" });
  }

  // 2. Solana RPC live check.
  const solana = createSolanaClient();
  const rpcResult = await solana.checkHealth();
  if (rpcResult.ok) {
    components.push({ name: "solana-rpc", status: "ok" });
  } else {
    components.push({
      name: "solana-rpc",
      status: "degraded",
      message: rpcResult.error.message,
    });
  }

  const overall: HealthStatus = components.some((c) => c.status === "degraded") ? "degraded" : "ok";

  const response: HealthResponse = {
    status: overall,
    env: serverEnv.NODE_ENV,
    cluster: publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    components,
  };

  logger.info(
    { healthStatus: overall, durationMs: Date.now() - startedAt, components },
    "health check completed",
  );

  return NextResponse.json(response, {
    status: overall === "ok" ? 200 : 503,
  });
}
