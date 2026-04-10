/**
 * Supabase client factories.
 *
 * We deliberately separate three flavors:
 *
 * 1. **anonClient** — uses the public anon key. Safe for server-side queries
 *    that are governed by Row-Level Security policies.
 * 2. **serviceClient** — uses the service role key. BYPASSES RLS. Only use
 *    for internal jobs that have been carefully audited.
 * 3. **browserClient** — used from client components via @supabase/ssr.
 *
 * Never import `serviceClient` from any file reachable by a client bundle.
 * The guard inside the factory is a belt-and-suspenders defense.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/config/env";
import { invariantNonNull } from "@/lib/invariant";

let anon: SupabaseClient | null = null;
let service: SupabaseClient | null = null;

/** Lazily constructed anon client. Returns null if Supabase is not configured. */
export function getAnonClient(): SupabaseClient | null {
  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL === undefined || publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY === undefined) {
    return null;
  }
  if (anon !== null) return anon;
  anon = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return anon;
}

/**
 * Service role client — BYPASSES RLS. Only use from server-side code.
 * Throws if the service role key is not configured, because using it
 * silently would be a security hazard.
 */
export function getServiceClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServiceClient() must never be called from client code");
  }
  invariantNonNull(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL is required for service client",
  );
  invariantNonNull(
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY is required for service client",
  );
  if (service !== null) return service;
  service = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return service;
}
