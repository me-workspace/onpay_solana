/**
 * drizzle-kit configuration.
 *
 * Drives: `npm run db:generate` (create migration from schema diff),
 *         `npm run db:migrate`  (apply migrations to the database),
 *         `npm run db:push`     (apply schema directly — dev only),
 *         `npm run db:studio`   (browse the database in a local UI).
 *
 * DATABASE_URL comes from .env.local. drizzle-kit loads .env files
 * automatically at startup.
 */
import { defineConfig } from "drizzle-kit";

// drizzle-kit loads .env.local automatically; we only read DATABASE_URL here.
// Avoid importing our app's env validator because drizzle-kit runs in its own
// process and doesn't need the full validation pipeline.
const databaseUrl = process.env["DATABASE_URL"];

if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required for drizzle-kit. Set it in .env.local and retry.");
}

export default defineConfig({
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
