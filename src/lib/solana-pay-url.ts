/**
 * Solana Pay URL builder.
 *
 * Generates the `solana:` URL that goes inside the QR code. This URL points
 * to OnPay's Transaction Request endpoint, which the buyer's wallet calls to
 * fetch a transaction to sign.
 *
 * Solana Pay specification:
 *   https://docs.solanapay.com/spec
 *
 * Format for a Transaction Request:
 *   solana:<URL-encoded https URL>
 *
 * IMPORTANT: Transaction Request URLs must NOT include query params like
 * `?label=` or `?message=`. Those are only valid for Transfer Requests
 * (where the recipient is a pubkey, not a URL). For Transaction Requests,
 * the label and icon are returned by the GET handler of the HTTPS endpoint.
 * Appending query params causes wallets (Phantom, Solflare, Backpack) to
 * misinterpret the URL as a Transfer Request, try to parse the encoded URL
 * as a base58 pubkey, and fail with "Invalid address".
 */
import type { InvoiceReference } from "@/domain/value-objects/reference";

export type BuildPaymentUrlInput = {
  /** Public base URL of the OnPay deployment, e.g. https://onpay.id */
  readonly baseUrl: string;
  /** The invoice reference (path segment of the tx endpoint). */
  readonly reference: InvoiceReference;
  /** @deprecated Ignored — label comes from the GET response, not the URL. */
  readonly label?: string | undefined;
  /** @deprecated Ignored — message comes from the GET response, not the URL. */
  readonly message?: string | undefined;
};

/**
 * Build the Solana Pay Transaction Request URL for an invoice.
 *
 * The URL is simply `solana:<encoded-https-url>` — no query params.
 * The wallet will:
 *   1. GET the HTTPS URL → receives `{ label, icon }`
 *   2. POST the HTTPS URL with `{ account }` → receives `{ transaction }`
 */
export function buildPaymentUrl(input: BuildPaymentUrlInput): string {
  const base = input.baseUrl.replace(/\/+$/, "");
  const txEndpoint = `${base}/api/tx/${encodeURIComponent(input.reference)}`;
  return `solana:${encodeURIComponent(txEndpoint)}`;
}
