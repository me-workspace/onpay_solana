/**
 * API versioning via the `OnPay-Version` request header.
 *
 * Follows the Stripe convention: versions are date strings (`YYYY-MM-DD`).
 * When a client omits the header, the current (latest) version is assumed.
 * When the header is present but not recognized, an `INVALID_REQUEST` error
 * is returned so clients get immediate feedback instead of silent breakage.
 *
 * This module is pure scaffolding — actual version-specific routing can be
 * layered on top once a second version is introduced.
 */
import type { NextRequest } from "next/server";

import { apiError } from "./api-error";

/** Header name used by clients to request a specific API version. */
export const VERSION_HEADER = "OnPay-Version";

/** The latest API version. New accounts default to this. */
export const CURRENT_API_VERSION = "2026-04-12";

/** All versions the server can handle. Oldest first. */
export const SUPPORTED_VERSIONS = ["2026-04-12"] as const;

/** Union of all supported version strings. */
export type ApiVersion = (typeof SUPPORTED_VERSIONS)[number];

/**
 * Read the requested API version from a request.
 *
 * @returns The version string from the `OnPay-Version` header, or
 *   `CURRENT_API_VERSION` when the header is absent.
 * @throws {ApiError} `INVALID_REQUEST` when the header is present but
 *   contains an unsupported version string.
 */
export function parseApiVersion(req: NextRequest): ApiVersion {
  const header = req.headers.get(VERSION_HEADER);

  if (header === null || header.length === 0) {
    return CURRENT_API_VERSION;
  }

  if (!isSupportedVersion(header)) {
    throw apiError(
      "INVALID_REQUEST",
      `Unsupported API version: "${header}". Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`,
    );
  }

  return header;
}

/** Type-guard that narrows an arbitrary string to `ApiVersion`. */
function isSupportedVersion(value: string): value is ApiVersion {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(value);
}
