/**
 * Payment entity — represents a confirmed on-chain payment against an invoice.
 *
 * A Payment is only created once the Solana transaction that performs the
 * swap-and-transfer is confirmed on-chain. Until then the Invoice remains
 * `pending`. This separation makes the model resilient: an attempted payment
 * that fails mid-transaction leaves no trace beyond an expired invoice.
 */
import type { InvoiceId } from "./invoice";

export type PaymentId = string & { readonly __brand: "PaymentId" };

export type Payment = {
  readonly id: PaymentId;
  readonly invoiceId: InvoiceId;
  /** Base58 wallet address of the buyer who signed the transaction. */
  readonly buyerWallet: string;
  /** SPL mint address of the token the buyer paid with. */
  readonly inputMint: string;
  /** Raw input amount in base units (no decimals applied). */
  readonly inputAmount: bigint;
  /** Raw output amount (USDC or settlement token) received by the merchant. */
  readonly outputAmount: bigint;
  /** Solana transaction signature (base58). */
  readonly txHash: string;
  readonly confirmedAt: Date;
};
