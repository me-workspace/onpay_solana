import { describe, expect, it } from "vitest";

import { CURRENT_API_VERSION, parseApiVersion, SUPPORTED_VERSIONS } from "@/lib/api-version";
import { ApiError } from "@/lib/api-error";

/** Helper to build a minimal NextRequest-like object with headers. */
function fakeRequest(headers: Record<string, string> = {}): Parameters<typeof parseApiVersion>[0] {
  return {
    headers: new Headers(headers),
  } as Parameters<typeof parseApiVersion>[0];
}

describe("parseApiVersion", () => {
  it("returns CURRENT_API_VERSION when the header is absent", () => {
    const req = fakeRequest();
    expect(parseApiVersion(req)).toBe(CURRENT_API_VERSION);
  });

  it("returns CURRENT_API_VERSION when the header is empty", () => {
    const req = fakeRequest({ "OnPay-Version": "" });
    expect(parseApiVersion(req)).toBe(CURRENT_API_VERSION);
  });

  it("returns the version when a supported version is provided", () => {
    for (const version of SUPPORTED_VERSIONS) {
      const req = fakeRequest({ "OnPay-Version": version });
      expect(parseApiVersion(req)).toBe(version);
    }
  });

  it("throws INVALID_REQUEST for an unsupported version", () => {
    const req = fakeRequest({ "OnPay-Version": "2020-01-01" });
    try {
      parseApiVersion(req);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("INVALID_REQUEST");
      expect((err as ApiError).message).toContain("2020-01-01");
    }
  });

  it("throws INVALID_REQUEST for a non-date string", () => {
    const req = fakeRequest({ "OnPay-Version": "latest" });
    try {
      parseApiVersion(req);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("INVALID_REQUEST");
    }
  });
});
