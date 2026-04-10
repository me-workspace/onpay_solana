/**
 * Structured logger built on Pino.
 *
 * - In development: pretty-printed, colorized.
 * - In production: newline-delimited JSON, one line per log event.
 *
 * Always log structured fields, never string-interpolate data into messages.
 * That makes logs filterable, searchable, and safe to parse.
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
import type { LoggerOptions } from "pino";

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

export const logger = pino(
  isProduction
    ? baseConfig
    : {
        ...baseConfig,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname,app,env",
          },
        },
      },
);

export type Logger = typeof logger;
