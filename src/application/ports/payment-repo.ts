/**
 * PaymentRepository port — persistence abstraction for confirmed on-chain payments.
 *
 * A Payment is only created once we have a finalized on-chain signature
 * proving the buyer's swap-and-transfer succeeded. Until then the invoice
 * stays in `pending` status and no payment row exists.
 */
import type { InvoiceId } from "@/domain/entities/invoice";
import type { Payment } from "@/domain/entities/payment";
import type { DomainError } from "@/domain/errors";
import type { Result } from "@/lib/result";

export type PaymentRepository = {
  findByTxHash(txHash: string): Promise<Result<Payment | null, DomainError>>;
  findByInvoiceId(invoiceId: InvoiceId): Promise<Result<Payment | null, DomainError>>;
  create(input: CreatePaymentInput): Promise<Result<Payment, DomainError>>;
};

export type CreatePaymentInput = {
  readonly invoiceId: InvoiceId;
  readonly buyerWallet: string;
  readonly inputMint: string;
  readonly inputAmount: bigint;
  readonly outputAmount: bigint;
  readonly txHash: string;
};
