import { describe, expect, it } from "vitest";

import {
  addMoney,
  formatMoney,
  moneyEquals,
  moneyFromBaseUnits,
  moneyFromDecimal,
} from "@/domain/value-objects/money";
import { isErr, isOk, unwrap } from "@/lib/result";

describe("Money", () => {
  describe("moneyFromBaseUnits", () => {
    it("accepts a valid amount", () => {
      const r = moneyFromBaseUnits(400n, "USD", 2);
      expect(isOk(r)).toBe(true);
      expect(unwrap(r).amount).toBe(400n);
    });

    it("rejects negative amounts", () => {
      const r = moneyFromBaseUnits(-1n, "USD", 2);
      expect(isErr(r)).toBe(true);
    });

    it("rejects invalid decimals", () => {
      expect(isErr(moneyFromBaseUnits(0n, "USD", -1))).toBe(true);
      expect(isErr(moneyFromBaseUnits(0n, "USD", 19))).toBe(true);
      expect(isErr(moneyFromBaseUnits(0n, "USD", 1.5))).toBe(true);
    });

    it("rejects empty currency", () => {
      expect(isErr(moneyFromBaseUnits(0n, "", 2))).toBe(true);
      expect(isErr(moneyFromBaseUnits(0n, "   ", 2))).toBe(true);
    });
  });

  describe("moneyFromDecimal", () => {
    it("parses a whole-dollar amount", () => {
      const r = moneyFromDecimal("4", "USD", 2);
      expect(unwrap(r).amount).toBe(400n);
    });

    it("parses a fractional amount", () => {
      const r = moneyFromDecimal("4.25", "USD", 2);
      expect(unwrap(r).amount).toBe(425n);
    });

    it("pads short fractional part", () => {
      const r = moneyFromDecimal("4.5", "USD", 2);
      expect(unwrap(r).amount).toBe(450n);
    });

    it("handles zero", () => {
      const r = moneyFromDecimal("0", "USD", 2);
      expect(unwrap(r).amount).toBe(0n);
    });

    it("rejects too many fractional digits", () => {
      expect(isErr(moneyFromDecimal("4.123", "USD", 2))).toBe(true);
    });

    it("rejects negative numbers", () => {
      expect(isErr(moneyFromDecimal("-4", "USD", 2))).toBe(true);
    });

    it("rejects scientific notation", () => {
      expect(isErr(moneyFromDecimal("1e2", "USD", 2))).toBe(true);
    });

    it("rejects garbage input", () => {
      expect(isErr(moneyFromDecimal("abc", "USD", 2))).toBe(true);
      expect(isErr(moneyFromDecimal("4.", "USD", 2))).toBe(true);
      expect(isErr(moneyFromDecimal(".5", "USD", 2))).toBe(true);
    });
  });

  describe("formatMoney", () => {
    it("formats with correct decimal places", () => {
      expect(formatMoney({ amount: 400n, currency: "USD", decimals: 2 })).toBe("4.00");
      expect(formatMoney({ amount: 1n, currency: "USD", decimals: 2 })).toBe("0.01");
      expect(formatMoney({ amount: 0n, currency: "USD", decimals: 2 })).toBe("0.00");
      expect(formatMoney({ amount: 1_000_000n, currency: "USDC", decimals: 6 })).toBe("1.000000");
    });

    it("formats zero-decimal currencies", () => {
      expect(formatMoney({ amount: 50_000n, currency: "IDR", decimals: 0 })).toBe("50000");
    });
  });

  describe("addMoney", () => {
    it("adds same-currency amounts", () => {
      const a = unwrap(moneyFromBaseUnits(100n, "USD", 2));
      const b = unwrap(moneyFromBaseUnits(250n, "USD", 2));
      const sum = unwrap(addMoney(a, b));
      expect(sum.amount).toBe(350n);
    });

    it("rejects mismatched currencies", () => {
      const a = unwrap(moneyFromBaseUnits(100n, "USD", 2));
      const b = unwrap(moneyFromBaseUnits(100n, "IDR", 2));
      expect(isErr(addMoney(a, b))).toBe(true);
    });
  });

  describe("moneyEquals", () => {
    it("returns true for identical values", () => {
      const a = unwrap(moneyFromBaseUnits(100n, "USD", 2));
      const b = unwrap(moneyFromBaseUnits(100n, "USD", 2));
      expect(moneyEquals(a, b)).toBe(true);
    });

    it("returns false for different amounts", () => {
      const a = unwrap(moneyFromBaseUnits(100n, "USD", 2));
      const b = unwrap(moneyFromBaseUnits(200n, "USD", 2));
      expect(moneyEquals(a, b)).toBe(false);
    });
  });
});
