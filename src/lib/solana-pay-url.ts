/**
 * Solana Pay URL builder.
 *
 * Generates the `solana://` URL that goes inside the QR code. This URL points
 * to OnPay's Transaction Request endpoint, which the buyer's wallet calls to
 * fetch a transaction to sign.
 *
 * Solana Pay specification:
 *   https://docs.solanapay.com/spec
 *
 * Format for a Transaction Request:
 *   solana:<URL-encoded https URL>?label=<text>&message=<text>
 *
 * Where the https URL is GET-able and returns `{ label, icon }`, and POST-able
 * and accepts `{ account }` to return `{ transaction, message }`.
 */
import type { InvoiceReference } from "@/domain/value-objects/reference";

export type BuildPaymentUrlInput = {
  /** Public base URL of the OnPay deployment, e.g. https://onpay.app */
  readonly baseUrl: string;
  /** The invoice reference (path segment of the tx endpoint). */
  readonly reference: InvoiceReference;
  /** Optional label shown to the buyer (typically the merchant's business name). */
  readonly label?: string | undefined;
  /** Optional message shown to the buyer (typically the invoice description). */
  readonly message?: string | undefined;
};

/**
 * Build the Solana Pay URL string for an invoice. This string can be passed
 * directly into a QR code renderer; any Solana Pay-compatible wallet will
 * recognize it and call the underlying HTTPS endpoint.
 */
export function buildPaymentUrl(input: BuildPaymentUrlInput): string {
  // Strip a trailing slash so we don't end up with a double slash in the path.
  const base = input.baseUrl.replace(/\/+$/, "");
  // Note: the path-segment must be percent-encoded for safety even though
  // our reference uses a URL-safe alphabet.
  const txEndpoint = `${base}/api/tx/${encodeURIComponent(input.reference)}`;

  // Per the Solana Pay spec, we URI-encode the underlying URL once, then
  // append optional query parameters that the wallet may surface to the user.
  const params = new URLSearchParams();
  if (input.label !== undefined && input.label.length > 0) {
    params.set("label", input.label);
  }
  if (input.message !== undefined && input.message.length > 0) {
    params.set("message", input.message);
  }

  const querySuffix = params.toString().length > 0 ? `?${params.toString()}` : "";
  return `solana:${encodeURIComponent(txEndpoint)}${querySuffix}`;
}
