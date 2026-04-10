/**
 * Money value object — represents a monetary amount with a specific currency.
 *
 * We use `bigint` for amounts to avoid floating-point errors that are
 * unacceptable in payment systems. Amounts are stored in the smallest unit
 * of the currency (e.g. cents for USD, lamports for SOL, base units for SPL
 * tokens). The `decimals` field tells us how to display it.
 *
 * Invariants enforced at construction time:
 * - amount is non-negative
 * - decimals is a non-negative integer
 * - currency is a non-empty ISO-ish symbol ("USD", "IDR", "USDC", ...)
 *
 * Arithmetic is intentionally limited: you can only operate on two Money
 * values if they share the same currency and decimals. Mixing currencies is
 * a domain error caller-visible via Result.
 */
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

import type { DomainError } from "../errors";
import { domainError } from "../errors";

export type Money = {
  readonly amount: bigint;
  readonly currency: string;
  readonly decimals: number;
};

/** Construct a Money from raw base units (e.g., cents, lamports). */
export function moneyFromBaseUnits(
  amount: bigint,
  currency: string,
  decimals: number,
): Result<Money, DomainError> {
  if (amount < 0n) {
    return err(domainError("VALIDATION_FAILED", "Money amount must be non-negative"));
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    return err(domainError("VALIDATION_FAILED", "Money decimals must be an integer in [0, 18]"));
  }
  if (currency.trim().length === 0) {
    return err(domainError("VALIDATION_FAILED", "Money currency must be non-empty"));
  }
  return ok({ amount, currency, decimals });
}

/**
 * Construct a Money from a decimal string (e.g., "4.00", "0.001").
 * Useful for parsing user input. The string must not use scientific notation.
 */
export function moneyFromDecimal(
  input: string,
  currency: string,
  decimals: number,
): Result<Money, DomainError> {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return err(domainError("VALIDATION_FAILED", `Invalid decimal string: "${input}"`));
  }
  const [intPart, fracPart = ""] = trimmed.split(".") as [string, string?];
  if (fracPart.length > decimals) {
    return err(
      domainError(
        "VALIDATION_FAILED",
        `Too many fractional digits for ${currency} (max ${String(decimals)})`,
      ),
    );
  }
  const padded = fracPart.padEnd(decimals, "0");
  const amount = BigInt(intPart + padded);
  return moneyFromBaseUnits(amount, currency, decimals);
}

/** Format a Money as a human-readable decimal string. */
export function formatMoney(money: Money): string {
  const s = money.amount.toString().padStart(money.decimals + 1, "0");
  const cut = s.length - money.decimals;
  const intPart = s.slice(0, cut);
  const fracPart = s.slice(cut);
  return money.decimals > 0 ? `${intPart}.${fracPart}` : intPart;
}

/** Add two Money values — only succeeds if currency and decimals match. */
export function addMoney(a: Money, b: Money): Result<Money, DomainError> {
  if (a.currency !== b.currency || a.decimals !== b.decimals) {
    return err(domainError("VALIDATION_FAILED", `Cannot add ${a.currency} and ${b.currency}`));
  }
  return moneyFromBaseUnits(a.amount + b.amount, a.currency, a.decimals);
}

/** Check whether two Money values are equal. */
export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.decimals === b.decimals && a.amount === b.amount;
}
