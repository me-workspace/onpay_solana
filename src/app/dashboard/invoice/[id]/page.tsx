import type { Metadata } from "next";

import { InvoiceDisplayClient } from "./_components/invoice-display-client";

export const metadata: Metadata = {
  title: "Payment",
};

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return <InvoiceDisplayClient invoiceId={id} />;
}
