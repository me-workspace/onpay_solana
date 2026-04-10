/**
 * Integration-style unit test for the createInvoice use case.
 *
 * Demonstrates the full dependency-injection pattern: we build fake
 * implementations of InvoiceRepository and Clock and feed them into the use
 * case. No database, no real time, no network.
 */
import { describe, expect, it } from "vitest";

import type { Clock } from "@/application/ports/clock";
import type { CreateInvoiceRepoInput, InvoiceRepository } from "@/application/ports/invoice-repo";
import { createInvoice } from "@/application/use-cases/create-invoice";
import type { Invoice, InvoiceId } from "@/domain/entities/invoice";
import type { Merchant, MerchantId } from "@/domain/entities/merchant";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";
import { isErr, isOk, unwrap } from "@/lib/result";
import { ok, err } from "@/lib/result";
import { domainError } from "@/domain/errors";

function makeFakeClock(fixed: Date): Clock {
  return { now: () => fixed };
}

function makeFakeRepo(): {
  repo: InvoiceRepository;
  lastCreate: { input?: CreateInvoiceRepoInput };
} {
  const state: { input?: CreateInvoiceRepoInput } = {};
  const repo: InvoiceRepository = {
    findById: () => Promise.resolve(ok(null)),
    findByReference: () => Promise.resolve(ok(null)),
    listByMerchant: () => Promise.resolve(ok([])),
    create: (input) => {
      state.input = input;
      const invoice: Invoice = {
        id: "inv_1" as InvoiceId,
        merchantId: input.merchantId,
        reference: input.reference,
        amount: input.amount,
        label: input.label,
        memo: input.memo,
        status: "pending",
        expiresAt: input.expiresAt,
        createdAt: new Date("2026-04-10T12:00:00Z"),
      };
      return Promise.resolve(ok(invoice));
    },
    updateStatus: () =>
      Promise.resolve(err(domainError("INTERNAL_ERROR", "not implemented in fake"))),
  };
  return { repo, lastCreate: state };
}

const fakeMerchant: Merchant = {
  id: "merch_1" as MerchantId,
  walletAddress: "5ABCDefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQR" as WalletAddress,
  businessName: "Kopi Canggu",
  settlementMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  preferredLanguage: "en",
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

describe("createInvoice use case", () => {
  it("creates an invoice with a valid amount", async () => {
    const clock = makeFakeClock(new Date("2026-04-10T12:00:00Z"));
    const { repo, lastCreate } = makeFakeRepo();

    const result = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "4.00",
        currency: "USD",
        decimals: 2,
        label: "Iced Latte",
        memo: null,
        ttlSeconds: 600,
      },
      { invoices: repo, clock },
    );

    expect(isOk(result)).toBe(true);
    const invoice = unwrap(result);
    expect(invoice.amount.amount).toBe(400n);
    expect(invoice.amount.currency).toBe("USD");
    expect(invoice.reference).toHaveLength(32);
    expect(invoice.expiresAt.toISOString()).toBe("2026-04-10T12:10:00.000Z");
    expect(lastCreate.input?.label).toBe("Iced Latte");
  });

  it("rejects zero amount", async () => {
    const clock = makeFakeClock(new Date("2026-04-10T12:00:00Z"));
    const { repo } = makeFakeRepo();

    const result = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "0",
        currency: "USD",
        decimals: 2,
        label: null,
        memo: null,
        ttlSeconds: 600,
      },
      { invoices: repo, clock },
    );

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("VALIDATION_FAILED");
      expect(result.error.message).toMatch(/greater than zero/i);
    }
  });

  it("rejects malformed amount", async () => {
    const clock = makeFakeClock(new Date("2026-04-10T12:00:00Z"));
    const { repo } = makeFakeRepo();

    const result = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "abc",
        currency: "USD",
        decimals: 2,
        label: null,
        memo: null,
        ttlSeconds: 600,
      },
      { invoices: repo, clock },
    );

    expect(isErr(result)).toBe(true);
  });

  it("rejects TTL out of bounds", async () => {
    const clock = makeFakeClock(new Date("2026-04-10T12:00:00Z"));
    const { repo } = makeFakeRepo();

    const tooShort = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "1",
        currency: "USD",
        decimals: 2,
        label: null,
        memo: null,
        ttlSeconds: 30,
      },
      { invoices: repo, clock },
    );
    expect(isErr(tooShort)).toBe(true);

    const tooLong = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "1",
        currency: "USD",
        decimals: 2,
        label: null,
        memo: null,
        ttlSeconds: 999_999,
      },
      { invoices: repo, clock },
    );
    expect(isErr(tooLong)).toBe(true);
  });

  it("rejects oversized label/memo", async () => {
    const clock = makeFakeClock(new Date("2026-04-10T12:00:00Z"));
    const { repo } = makeFakeRepo();

    const longLabel = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "1",
        currency: "USD",
        decimals: 2,
        label: "a".repeat(201),
        memo: null,
        ttlSeconds: 600,
      },
      { invoices: repo, clock },
    );
    expect(isErr(longLabel)).toBe(true);

    const longMemo = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "1",
        currency: "USD",
        decimals: 2,
        label: null,
        memo: "a".repeat(501),
        ttlSeconds: 600,
      },
      { invoices: repo, clock },
    );
    expect(isErr(longMemo)).toBe(true);
  });

  it("propagates repository errors", async () => {
    const clock = makeFakeClock(new Date("2026-04-10T12:00:00Z"));
    const failingRepo: InvoiceRepository = {
      findById: () => Promise.resolve(ok(null)),
      findByReference: () => Promise.resolve(ok(null)),
      listByMerchant: () => Promise.resolve(ok([])),
      create: () => Promise.resolve(err(domainError("UPSTREAM_FAILURE", "db down"))),
      updateStatus: () => Promise.resolve(err(domainError("INTERNAL_ERROR", "n/a"))),
    };

    const result = await createInvoice(
      {
        merchant: fakeMerchant,
        amountDecimal: "1",
        currency: "USD",
        decimals: 2,
        label: null,
        memo: null,
        ttlSeconds: 600,
      },
      { invoices: failingRepo, clock },
    );

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("UPSTREAM_FAILURE");
    }
  });
});
