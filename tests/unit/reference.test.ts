import { describe, expect, it } from "vitest";

import { generateInvoiceReference, parseInvoiceReference } from "@/domain/value-objects/reference";
import { isErr, isOk, unwrap } from "@/lib/result";

describe("InvoiceReference", () => {
  it("generates a 32-character reference", () => {
    const ref = generateInvoiceReference();
    expect(ref).toHaveLength(32);
  });

  it("generates unique references", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateInvoiceReference()));
    expect(refs.size).toBe(100);
  });

  it("parses a valid reference", () => {
    const ref = generateInvoiceReference();
    const parsed = parseInvoiceReference(ref);
    expect(isOk(parsed)).toBe(true);
    expect(unwrap(parsed)).toBe(ref);
  });

  it("rejects wrong length", () => {
    expect(isErr(parseInvoiceReference("abc"))).toBe(true);
    expect(isErr(parseInvoiceReference("a".repeat(33)))).toBe(true);
  });

  it("rejects invalid characters", () => {
    expect(isErr(parseInvoiceReference("!".repeat(32)))).toBe(true);
    expect(isErr(parseInvoiceReference(" ".repeat(32)))).toBe(true);
  });
});
