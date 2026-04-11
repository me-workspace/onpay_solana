/**
 * Unit tests for the confirmInvoice use case — exercises every branch of
 * the payment confirmation loop with fully faked ports. No network, no DB,
 * no real Solana.
 */
import { describe, expect, it } from "vitest";

import type { Clock } from "@/application/ports/clock";
import type { InvoiceRepository } from "@/application/ports/invoice-repo";
import type { PaymentRepository } from "@/application/ports/payment-repo";
import type { ReferenceSignature, SolanaClient } from "@/application/ports/solana-client";
import { confirmInvoice } from "@/application/use-cases/confirm-invoice";
import type { Invoice, InvoiceId, InvoiceStatus } from "@/domain/entities/invoice";
import type { MerchantId } from "@/domain/entities/merchant";
import type { Payment, PaymentId } from "@/domain/entities/payment";
import { domainError } from "@/domain/errors";
import type { InvoiceReference } from "@/domain/value-objects/reference";
import { err, isErr, isOk, ok, unwrap } from "@/lib/result";

const FIXED_NOW = new Date("2026-04-11T12:00:00Z");
const FUTURE = new Date("2026-04-11T12:10:00Z");
const PAST = new Date("2026-04-11T11:50:00Z");

const REFERENCE = "BVNo8ftg2LkkssnWT4ZWdtoFaevnfD6ExYeramwM27pe" as InvoiceReference;

const fixedClock: Clock = { now: () => FIXED_NOW };

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv_1" as InvoiceId,
    merchantId: "merch_1" as MerchantId,
    reference: REFERENCE,
    amount: { amount: 400n, currency: "USD", decimals: 2 },
    label: "Iced Latte",
    memo: null,
    status: "pending",
    expiresAt: FUTURE,
    createdAt: new Date("2026-04-11T11:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Port builders
// ---------------------------------------------------------------------------

type InvoicesFake = InvoiceRepository & { lastStatus?: InvoiceStatus };

function makeInvoicesRepo(updatedTo: InvoiceStatus = "paid"): InvoicesFake {
  const state: { lastStatus?: InvoiceStatus } = {};
  const base: InvoiceRepository = {
    findById: () => Promise.resolve(ok(null)),
    findByReference: () => Promise.resolve(ok(null)),
    listByMerchant: () => Promise.resolve(ok([])),
    create: () => Promise.resolve(err(domainError("INTERNAL_ERROR", "n/a"))),
    updateStatus: (id, status) => {
      state.lastStatus = status;
      return Promise.resolve(
        ok({
          ...makeInvoice({ id, status: updatedTo }),
        }),
      );
    },
  };
  return Object.assign(base, state);
}

function makePaymentsRepo(options: { existing?: Payment; failCreate?: boolean } = {}): {
  repo: PaymentRepository;
  lastCreate: { args?: unknown };
} {
  const lastCreate: { args?: unknown } = {};
  const repo: PaymentRepository = {
    findByTxHash: () => Promise.resolve(ok(options.existing ?? null)),
    findByInvoiceId: () => Promise.resolve(ok(null)),
    create: (input) => {
      lastCreate.args = input;
      if (options.failCreate === true) {
        return Promise.resolve(err(domainError("UPSTREAM_FAILURE", "insert conflict")));
      }
      const payment: Payment = {
        id: "pay_1" as PaymentId,
        invoiceId: input.invoiceId,
        buyerWallet: input.buyerWallet,
        inputMint: input.inputMint,
        inputAmount: input.inputAmount,
        outputAmount: input.outputAmount,
        txHash: input.txHash,
        confirmedAt: FIXED_NOW,
      };
      return Promise.resolve(ok(payment));
    },
  };
  return { repo, lastCreate };
}

function makeSolanaClient(signatures: ReferenceSignature[] = []): SolanaClient {
  return {
    getLatestBlockhash: () => Promise.resolve(ok({ blockhash: "x", lastValidBlockHeight: 0 })),
    getAddressLookupTables: () => Promise.resolve(ok([])),
    findSignaturesForReference: () => Promise.resolve(ok(signatures)),
    checkHealth: () => Promise.resolve(ok(true as const)),
  };
}

function makeFailingSolanaClient(): SolanaClient {
  return {
    getLatestBlockhash: () => Promise.resolve(ok({ blockhash: "x", lastValidBlockHeight: 0 })),
    getAddressLookupTables: () => Promise.resolve(ok([])),
    findSignaturesForReference: () =>
      Promise.resolve(err(domainError("UPSTREAM_FAILURE", "rpc down"))),
    checkHealth: () => Promise.resolve(ok(true as const)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("confirmInvoice use case", () => {
  it("returns terminal invoices unchanged (already paid)", async () => {
    const invoice = makeInvoice({ status: "paid" });
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo(),
      payments: makePaymentsRepo().repo,
      solana: makeSolanaClient(),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("paid");
  });

  it("marks expired invoices as expired", async () => {
    const invoice = makeInvoice({ expiresAt: PAST });
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo("expired"),
      payments: makePaymentsRepo().repo,
      solana: makeSolanaClient(),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("expired");
  });

  it("returns unchanged pending when no on-chain signature exists", async () => {
    const invoice = makeInvoice();
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo(),
      payments: makePaymentsRepo().repo,
      solana: makeSolanaClient([]),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("pending");
  });

  it("flips to paid and records a payment when a signature is found", async () => {
    const invoice = makeInvoice();
    const payments = makePaymentsRepo();
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo("paid"),
      payments: payments.repo,
      solana: makeSolanaClient([{ signature: "sig_hash_1", slot: 200, blockTime: 123, err: null }]),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("paid");
    expect(payments.lastCreate.args).toBeDefined();
  });

  it("picks the oldest signature when multiple are found", async () => {
    const invoice = makeInvoice();
    const payments = makePaymentsRepo();
    await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo("paid"),
      payments: payments.repo,
      solana: makeSolanaClient([
        { signature: "newer", slot: 300, blockTime: 200, err: null },
        { signature: "older", slot: 100, blockTime: 50, err: null },
      ]),
      clock: fixedClock,
    });
    expect(payments.lastCreate.args).toMatchObject({ txHash: "older" });
  });

  it("returns unchanged pending when RPC fails (graceful degradation)", async () => {
    const invoice = makeInvoice();
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo(),
      payments: makePaymentsRepo().repo,
      solana: makeFailingSolanaClient(),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("pending");
  });

  it("is idempotent — existing payment row for same tx hash still flips to paid", async () => {
    const invoice = makeInvoice();
    const existingPayment: Payment = {
      id: "pay_existing" as PaymentId,
      invoiceId: invoice.id,
      buyerWallet: "buyer",
      inputMint: "sol",
      inputAmount: 1000n,
      outputAmount: 400n,
      txHash: "dup_hash",
      confirmedAt: new Date(),
    };
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo("paid"),
      payments: makePaymentsRepo({ existing: existingPayment }).repo,
      solana: makeSolanaClient([{ signature: "dup_hash", slot: 10, blockTime: 1, err: null }]),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("paid");
  });

  it("recovers from a concurrent-insert race (unique violation)", async () => {
    const invoice = makeInvoice();
    // First findByTxHash returns null, payment.create fails, second findByTxHash
    // returns the row that the racing request inserted. We simulate this with
    // a stateful fake: first call null, second call the existing row.
    let callCount = 0;
    const racingPayment: Payment = {
      id: "pay_race" as PaymentId,
      invoiceId: invoice.id,
      buyerWallet: "",
      inputMint: "",
      inputAmount: 0n,
      outputAmount: 400n,
      txHash: "race_sig",
      confirmedAt: new Date(),
    };
    const racingRepo: PaymentRepository = {
      findByTxHash: () => {
        callCount += 1;
        return Promise.resolve(ok(callCount === 1 ? null : racingPayment));
      },
      findByInvoiceId: () => Promise.resolve(ok(null)),
      create: () => Promise.resolve(err(domainError("UPSTREAM_FAILURE", "duplicate key"))),
    };
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo("paid"),
      payments: racingRepo,
      solana: makeSolanaClient([{ signature: "race_sig", slot: 50, blockTime: 1, err: null }]),
      clock: fixedClock,
    });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).status).toBe("paid");
  });

  it("surfaces a real insert failure when race recovery also fails", async () => {
    const invoice = makeInvoice();
    const brokenRepo: PaymentRepository = {
      findByTxHash: () => Promise.resolve(ok(null)),
      findByInvoiceId: () => Promise.resolve(ok(null)),
      create: () => Promise.resolve(err(domainError("UPSTREAM_FAILURE", "db down"))),
    };
    const result = await confirmInvoice(invoice, {
      invoices: makeInvoicesRepo("paid"),
      payments: brokenRepo,
      solana: makeSolanaClient([{ signature: "sig", slot: 1, blockTime: 1, err: null }]),
      clock: fixedClock,
    });
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("INTERNAL_ERROR");
    }
  });
});
