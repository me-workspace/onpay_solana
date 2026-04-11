/**
 * Structured logger built on Pino.
 *
 * - In production: newline-delimited JSON via pino's default stdout writer.
 * - In development: same JSON format, routed through pino-pretty synchronously
 *   so the output stays readable in the terminal. We deliberately avoid the
 *   worker-based transport (`transport: { target: 'pino-pretty' }`) because
 *   Next.js dev mode's HMR invalidates modules repeatedly, which causes
 *   pino-pretty's worker thread to exit — and then every subsequent
 *   `logger.info()` throws "Error: the worker has exited" and takes down
 *   the API route. The sync approach has the same output and zero worker
 *   lifecycle issues.
 *
 * Always log structured fields, never string-interpolate data into messages.
 *
 * @example
 * ```ts
 * logger.info({ merchantId, invoiceId }, "invoice created");
 * logger.error({ err, invoiceId }, "failed to build transaction");
 * ```
 *
 * @example Child logger for a specific request:
 * ```ts
 * const log = logger.child({ requestId, route: "/api/invoices" });
 * log.info({ amount }, "creating invoice");
 * ```
 */
import pino from "pino";
import type { DestinationStream, LoggerOptions } from "pino";
import PinoPretty from "pino-pretty";

import { serverEnv } from "@/config/env.server";

const isProduction = serverEnv.NODE_ENV === "production";

const baseConfig: LoggerOptions = {
  level: serverEnv.LOG_LEVEL,
  base: {
    app: "onpay",
    env: serverEnv.NODE_ENV,
  },
  // Redact fields that might contain secrets. Add new keys here if we ever
  // accidentally log a token, private key, service role, or similar.
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.authorization",
      "*.privateKey",
      "*.serviceRoleKey",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

/** Build the dev-mode pretty stream synchronously (no worker thread). */
function createPrettyStream(): DestinationStream {
  return PinoPretty({
    colorize: true,
    translateTime: "SYS:HH:MM:ss.l",
    ignore: "pid,hostname,app,env",
    sync: true,
  });
}

export const logger = isProduction ? pino(baseConfig) : pino(baseConfig, createPrettyStream());

export type Logger = typeof logger;
