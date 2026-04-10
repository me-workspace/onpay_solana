/**
 * Environment variable validation.
 *
 * We validate all env vars at module load time using Zod. If anything is
 * missing or malformed, the app crashes immediately with a helpful error.
 * This is deliberate: silent misconfiguration is one of the most common
 * sources of production bugs.
 *
 * Two shapes are exported:
 * - `serverEnv`: full env, only importable from server-side code.
 * - `publicEnv`: only NEXT_PUBLIC_* variables, safe for client bundles.
 *
 * To add a new variable:
 * 1. Add it to `.env.example` with documentation.
 * 2. Add it to the appropriate schema below.
 * 3. Access it via `serverEnv.FOO` or `publicEnv.NEXT_PUBLIC_FOO`.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const solanaClusterSchema = z.enum(["devnet", "mainnet-beta"]);

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]);

/**
 * Helper: an optional string that treats the empty string as undefined.
 * Empty strings come from `.env` lines like `FOO=` which are very common.
 * We want those treated as "not set" rather than "set to empty string".
 */
const emptyAsUndefined = z
  .string()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Variables that are safe to expose to the browser. Must be prefixed with NEXT_PUBLIC_. */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SOLANA_CLUSTER: solanaClusterSchema.default("devnet"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

/** Server-only variables. Never expose these to the client. */
const serverEnvSchema = publicEnvSchema.extend({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ---- PostgreSQL --------------------------------------------------------
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),

  // ---- Solana ------------------------------------------------------------
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_RPC_FALLBACK_URL: emptyAsUndefined.pipe(z.string().url().optional()),

  // ---- Jupiter -----------------------------------------------------------
  JUPITER_API_URL: z.string().url().default("https://quote-api.jup.ag/v6"),
  JUPITER_MAX_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(1000).default(100),

  // ---- Business config ---------------------------------------------------
  DEFAULT_SETTLEMENT_MINT: z.string().min(32).max(44),

  // ---- Observability -----------------------------------------------------
  LOG_LEVEL: logLevelSchema.default("info"),

  // ---- Invoice lifecycle -------------------------------------------------
  INVOICE_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format Zod errors into a developer-friendly multi-line message.
 * Used to make env validation failures easy to debug.
 */
function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  • ${path}: ${issue.message}`;
    })
    .join("\n");
}

/**
 * Parse env vars with a schema. On failure, throws a detailed error containing
 * every missing or malformed variable so the developer can fix them all at once.
 */
function parseEnv<Schema extends z.ZodType<Record<string, unknown>>>(
  schema: Schema,
  source: Record<string, string | undefined>,
): z.output<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = formatZodError(result.error);
    throw new Error(
      `Invalid environment configuration:\n${details}\n\n` +
        `Fix these issues in your .env.local file and restart the app. ` +
        `See .env.example for documentation.`,
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Client-safe public env. Safe to import anywhere.
 * Only contains NEXT_PUBLIC_* variables.
 */
export const publicEnv = parseEnv(publicEnvSchema, {
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

/**
 * Full server env. NEVER import this from a client component.
 * Importing it from a client component will leak secrets into the browser bundle.
 */
export const serverEnv = parseEnv(serverEnvSchema, process.env);

/** Convenience type exports. */
export type PublicEnv = typeof publicEnv;
export type ServerEnv = typeof serverEnv;
