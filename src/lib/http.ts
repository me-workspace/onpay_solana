/**
 * HTTP helpers for API routes.
 *
 * These wrap common patterns in Next.js API routes to enforce consistent
 * behavior across the codebase:
 *
 * - Request bodies are always validated with a Zod schema before use.
 * - Errors are always returned as typed `ApiError` JSON responses.
 * - Unexpected exceptions are logged and mapped to an opaque 500 — never
 *   leak internal details to clients.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { z } from "zod";

import { logger } from "@/lib/logger";

import { ApiError, apiError } from "./api-error";

/**
 * Parse a JSON request body and validate it against a Zod schema.
 * Returns the parsed value on success, or an `ApiError` on failure.
 *
 * We do NOT return a Result here because API routes are the top layer of the
 * stack; throwing inside them is trapped by `withErrorHandler` below.
 */
export async function parseJsonBody<Schema extends z.ZodType<unknown>>(
  req: NextRequest,
  schema: Schema,
): Promise<z.output<Schema>> {
  let raw: unknown;
  try {
    raw = (await req.json()) as unknown;
  } catch {
    throw apiError("INVALID_REQUEST", "Request body must be valid JSON");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw apiError("INVALID_REQUEST", "Request body failed validation", {
      details: result.error.flatten(),
    });
  }
  return result.data;
}

/**
 * Parse a URL query parameter against a Zod schema.
 * Throws an ApiError if validation fails.
 */
export function parseQueryParam<Schema extends z.ZodType<unknown>>(
  req: NextRequest,
  key: string,
  schema: Schema,
): z.output<Schema> {
  const raw = req.nextUrl.searchParams.get(key);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw apiError("INVALID_REQUEST", `Invalid query parameter: ${key}`, {
      details: result.error.flatten(),
    });
  }
  return result.data;
}

/**
 * Wrap an API route handler with standardized error handling.
 *
 * Any thrown ApiError is returned as its JSON response.
 * Any other thrown value is logged and returned as an opaque 500.
 *
 * @example
 * ```ts
 * export const POST = withErrorHandler(async (req) => {
 *   const body = await parseJsonBody(req, CreateInvoiceSchema);
 *   // ...
 *   return NextResponse.json(result);
 * });
 * ```
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (req: NextRequest, ...args: Args) => Promise<Response>,
): (req: NextRequest, ...args: Args) => Promise<Response> {
  return async (req, ...args) => {
    const route = req.nextUrl.pathname;
    const method = req.method;
    const log = logger.child({ route, method });

    try {
      return await handler(req, ...args);
    } catch (thrown: unknown) {
      if (thrown instanceof ApiError) {
        log.warn(
          { code: thrown.code, status: thrown.status, message: thrown.message },
          "api error",
        );
        return thrown.toJsonResponse();
      }

      log.error({ err: thrown }, "unhandled exception in api route");
      return NextResponse.json(
        {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again.",
        },
        { status: 500 },
      );
    }
  };
}
