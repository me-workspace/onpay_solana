/**
 * Client-safe public environment variables.
 *
 * This file contains ONLY variables prefixed with `NEXT_PUBLIC_`. It is
 * safe to import from both server and client code. Next.js inlines
 * NEXT_PUBLIC_* references as literals in client bundles at build time,
 * so the values are always defined in both runtimes.
 *
 * Server-only env vars (DATABASE_URL, RPC keys, secrets, etc.) live in
 * `env.server.ts`, which imports `server-only` so Next.js will refuse to
 * bundle it into the browser.
 *
 * Why the split: if server and public vars live in the same module, any
 * client component that imports `publicEnv` also transitively triggers
 * evaluation of the server-env validation — and in the browser,
 * `process.env.DATABASE_URL` is undefined, so the validation throws and
 * the whole page crashes at render time.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const solanaClusterSchema = z.enum(["devnet", "mainnet-beta"]);

/** Variables that are safe to expose to the browser. Must be prefixed with NEXT_PUBLIC_. */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SOLANA_CLUSTER: solanaClusterSchema.default("devnet"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  • ${path}: ${issue.message}`;
    })
    .join("\n");
}

const parseResult = publicEnvSchema.safeParse({
  // Webpack inlines these as literals in client bundles, so they are
  // defined in both server and browser contexts.
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parseResult.success) {
  const details = formatZodError(parseResult.error);
  throw new Error(
    `Invalid public environment configuration:\n${details}\n\n` +
      `Fix these issues in your .env.local file and restart the app. ` +
      `See .env.example for documentation.`,
  );
}

/**
 * Client-safe public env. Safe to import from any file, including React
 * client components. Only contains NEXT_PUBLIC_* variables.
 */
export const publicEnv = parseResult.data;

export type PublicEnv = typeof publicEnv;
