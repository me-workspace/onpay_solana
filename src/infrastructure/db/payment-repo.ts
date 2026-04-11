/**
 * Drizzle-backed implementation of `PaymentRepository`.
 */
import { eq } from "drizzle-orm";

import type { CreatePaymentInput, PaymentRepository } from "@/application/ports/payment-repo";
import type { InvoiceId } from "@/domain/entities/invoice";
import type { Payment, PaymentId } from "@/domain/entities/payment";
import { domainError, type DomainError } from "@/domain/errors";
import { err, ok, tryAsync, type Result } from "@/lib/result";

import type { Database } from "./client";
import { type PaymentRow, payments } from "./schema";

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id as PaymentId,
    invoiceId: row.invoiceId as InvoiceId,
    buyerWallet: row.buyerWallet,
    inputMint: row.inputMint,
    inputAmount: BigInt(row.inputAmount),
    outputAmount: BigInt(row.outputAmount),
    txHash: row.txHash,
    confirmedAt: row.confirmedAt,
  };
}

async function runQuery<T>(label: string, fn: () => Promise<T>): Promise<Result<T, DomainError>> {
  const result = await tryAsync(fn(), (cause) => ({ cause }));
  if (result.ok) return ok(result.value);
  return err(
    domainError("UPSTREAM_FAILURE", `Database operation failed: ${label}`, {
      cause: result.error.cause,
    }),
  );
}

export function createPaymentRepository(db: Database): PaymentRepository {
  return {
    async findByTxHash(txHash: string): Promise<Result<Payment | null, DomainError>> {
      const result = await runQuery("findPaymentByTxHash", () =>
        db.select().from(payments).where(eq(payments.txHash, txHash)).limit(1),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      return ok(row !== undefined ? rowToPayment(row) : null);
    },

    async findByInvoiceId(invoiceId: InvoiceId): Promise<Result<Payment | null, DomainError>> {
      const result = await runQuery("findPaymentByInvoiceId", () =>
        db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).limit(1),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      return ok(row !== undefined ? rowToPayment(row) : null);
    },

    async create(input: CreatePaymentInput): Promise<Result<Payment, DomainError>> {
      const result = await runQuery("createPayment", () =>
        db
          .insert(payments)
          .values({
            invoiceId: input.invoiceId,
            buyerWallet: input.buyerWallet,
            inputMint: input.inputMint,
            inputAmount: input.inputAmount.toString(),
            outputAmount: input.outputAmount.toString(),
            txHash: input.txHash,
          })
          .returning(),
      );
      if (!result.ok) return result;
      const row = result.value[0];
      if (row === undefined) {
        return err(domainError("UPSTREAM_FAILURE", "Insert returned no row"));
      }
      return ok(rowToPayment(row));
    },
  };
}
