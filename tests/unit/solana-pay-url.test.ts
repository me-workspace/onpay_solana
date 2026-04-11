import { describe, expect, it } from "vitest";

import type { InvoiceReference } from "@/domain/value-objects/reference";
import { buildPaymentUrl } from "@/lib/solana-pay-url";

const FAKE_REFERENCE = "BVNo8ftg2LkkssnWT4ZWdtoFaevnfD6ExYeramwM27pe" as InvoiceReference;

describe("buildPaymentUrl", () => {
  it("builds a solana: URL pointing to the tx endpoint", () => {
    const url = buildPaymentUrl({
      baseUrl: "https://onpay.app",
      reference: FAKE_REFERENCE,
    });
    expect(url).toContain("solana:");
    expect(url).toContain(encodeURIComponent("https://onpay.app/api/tx/" + FAKE_REFERENCE));
  });

  it("strips trailing slashes from the base URL", () => {
    const a = buildPaymentUrl({ baseUrl: "https://onpay.app/", reference: FAKE_REFERENCE });
    const b = buildPaymentUrl({ baseUrl: "https://onpay.app", reference: FAKE_REFERENCE });
    expect(a).toBe(b);
  });

  it("appends label and message as query params", () => {
    const url = buildPaymentUrl({
      baseUrl: "https://onpay.app",
      reference: FAKE_REFERENCE,
      label: "Kopi Canggu",
      message: "Iced Latte x2",
    });
    expect(url).toContain("label=Kopi+Canggu");
    expect(url).toContain("message=Iced+Latte+x2");
  });

  it("omits empty label and message", () => {
    const url = buildPaymentUrl({
      baseUrl: "https://onpay.app",
      reference: FAKE_REFERENCE,
      label: "",
      message: "",
    });
    expect(url).not.toContain("label=");
    expect(url).not.toContain("message=");
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
