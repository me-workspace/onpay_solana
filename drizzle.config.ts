/**
 * drizzle-kit configuration.
 *
 * Drives: `npm run db:generate` (create migration from schema diff),
 *         `npm run db:migrate`  (apply migrations to the database),
 *         `npm run db:push`     (apply schema directly — dev only),
 *         `npm run db:studio`   (browse the database in a local UI).
 *
 * drizzle-kit runs as a standalone Node process (not inside Next.js), so
 * Next's automatic `.env.local` loading doesn't apply. We load the env
 * ourselves via Node's built-in --env-file flag at the top of this module.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "drizzle-kit";

// Best-effort load of .env.local for drizzle-kit commands. We skip any line
// already present in process.env so real environment overrides still win.
const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  const content = readFileSync(envFile, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

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
