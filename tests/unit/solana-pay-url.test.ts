import { describe, expect, it } from "vitest";

import type { InvoiceReference } from "@/domain/value-objects/reference";
import { buildPaymentUrl } from "@/lib/solana-pay-url";

const FAKE_REFERENCE = "BVNo8ftg2LkkssnWT4ZWdtoFaevnfD6ExYeramwM27pe" as InvoiceReference;

describe("buildPaymentUrl", () => {
  it("builds a solana: URL pointing to the tx endpoint", () => {
    const url = buildPaymentUrl({
      baseUrl: "https://onpay.id",
      reference: FAKE_REFERENCE,
    });
    expect(url).toContain("solana:");
    expect(url).toContain(encodeURIComponent("https://onpay.id/api/tx/" + FAKE_REFERENCE));
  });

  it("strips trailing slashes from the base URL", () => {
    const a = buildPaymentUrl({ baseUrl: "https://onpay.id/", reference: FAKE_REFERENCE });
    const b = buildPaymentUrl({ baseUrl: "https://onpay.id", reference: FAKE_REFERENCE });
    expect(a).toBe(b);
  });

  it("does NOT append label or message as query params (Transaction Request spec)", () => {
    const url = buildPaymentUrl({
      baseUrl: "https://onpay.id",
      reference: FAKE_REFERENCE,
      label: "Kopi Canggu",
      message: "Iced Latte x2",
    });
    // Transaction Requests must NOT have query params — wallets get the
    // label and icon from the GET response of the HTTPS endpoint.
    expect(url).not.toContain("label=");
    expect(url).not.toContain("message=");
    expect(url).not.toContain("?");
  });

  it("produces a clean URL with no query string", () => {
    const url = buildPaymentUrl({
      baseUrl: "https://onpay.id",
      reference: FAKE_REFERENCE,
    });
    expect(url).toBe(`solana:${encodeURIComponent(`https://onpay.id/api/tx/${FAKE_REFERENCE}`)}`);
  });

  it("works with a localhost development URL", () => {
    const url = buildPaymentUrl({
      baseUrl: "http://localhost:3000",
      reference: FAKE_REFERENCE,
    });
    expect(url).toContain("solana:");
    expect(url).toContain(encodeURIComponent(`http://localhost:3000/api/tx/${FAKE_REFERENCE}`));
  });
});
