/**
 * Server-only environment variables.
 *
 * The `import "server-only"` directive is a Next.js convention: if this
 * module is ever accidentally imported from a client component or shared
 * module that ends up in a client bundle, the build will fail with a
 * clear error pointing at the import chain. This is a belt-and-suspenders
 * defense against the class of bug where secrets leak into the browser.
 *
 * All values are validated at module load time via Zod. If any required
 * variable is missing or malformed, the app refuses to start with a
 * detailed error listing every problem at once.
 */
import "server-only";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

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

const serverEnvSchema = z.object({
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

  // ---- Auth --------------------------------------------------------------
  /**
   * Secret used to sign JWT session cookies. Must be at least 32 chars of
   * high-entropy random bytes. Generate with:
   *   openssl rand -base64 48
   */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  /** How long a session JWT remains valid, in seconds. Default 24 hours. */
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).default(86_400),

  // ---- Business config ---------------------------------------------------
  DEFAULT_SETTLEMENT_MINT: z.string().min(32).max(44),

  // ---- Observability -----------------------------------------------------
  LOG_LEVEL: logLevelSchema.default("info"),

  // ---- Invoice lifecycle -------------------------------------------------
  INVOICE_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),

  // ---- Internal cron -----------------------------------------------------
  /**
   * Shared secret that must be present as `x-cron-secret` on every call
   * to internal cron endpoints (/api/cron/*). Blocks public access to
   * expiration sweepers, etc.
   */
  CRON_SECRET: emptyAsUndefined.pipe(z.string().min(16).optional()),
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

const parseResult = serverEnvSchema.safeParse(process.env);

if (!parseResult.success) {
  const details = formatZodError(parseResult.error);
  throw new Error(
    `Invalid server environment configuration:\n${details}\n\n` +
      `Fix these issues in your .env.local file and restart the app. ` +
      `See .env.example for documentation.`,
  );
}

/**
 * Full server env. NEVER import this from a client component or shared
 * module used by client code. The `server-only` import above will cause
 * a loud build failure if you try.
 */
export const serverEnv = parseResult.data;

export type ServerEnv = typeof serverEnv;
