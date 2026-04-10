import type { Metadata } from "next";

import { NewInvoiceClient } from "./_components/new-invoice-client";

export const metadata: Metadata = {
  title: "New payment",
};

export default function NewInvoicePage(): React.JSX.Element {
  return <NewInvoiceClient />;
}
