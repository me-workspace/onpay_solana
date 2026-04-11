import { describe, expect, it } from "vitest";

import { parseInvoiceReference } from "@/domain/value-objects/reference";
import { generateInvoiceReference } from "@/lib/solana-pubkey";
import { isErr, isOk, unwrap } from "@/lib/result";

describe("InvoiceReference", () => {
  it("generates a base58 pubkey of valid length", () => {
    const ref = generateInvoiceReference();
    // Solana pubkeys are 32 raw bytes → 43-44 base58 chars.
    expect(ref.length).toBeGreaterThanOrEqual(32);
    expect(ref.length).toBeLessThanOrEqual(44);
  });

  it("generates unique references", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateInvoiceReference()));
    expect(refs.size).toBe(100);
  });

  it("parses a valid generated reference round-trip", () => {
    const ref = generateInvoiceReference();
    const parsed = parseInvoiceReference(ref);
    expect(isOk(parsed)).toBe(true);
    expect(unwrap(parsed)).toBe(ref);
  });

  it("accepts a well-known mainnet pubkey shape", () => {
    // USDC mainnet mint — real 44-char base58 pubkey.
    const parsed = parseInvoiceReference("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(isOk(parsed)).toBe(true);
  });

  it("rejects too short", () => {
    expect(isErr(parseInvoiceReference("abc"))).toBe(true);
    expect(isErr(parseInvoiceReference("a".repeat(31)))).toBe(true);
  });

  it("rejects too long", () => {
    expect(isErr(parseInvoiceReference("a".repeat(45)))).toBe(true);
  });

  it("rejects characters outside the base58 alphabet", () => {
    // Contains '0' (zero), which is not in base58.
    expect(isErr(parseInvoiceReference("0".repeat(44)))).toBe(true);
    // Contains 'O' (capital O), not in base58.
    expect(isErr(parseInvoiceReference("O".repeat(44)))).toBe(true);
    // Contains 'l' (lowercase L), not in base58.
    expect(isErr(parseInvoiceReference("l".repeat(44)))).toBe(true);
    // Contains a non-alphanumeric character.
    expect(isErr(parseInvoiceReference("!".repeat(44)))).toBe(true);
  });
});
