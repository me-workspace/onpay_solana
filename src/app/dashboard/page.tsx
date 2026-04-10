/**
 * Merchant dashboard root.
 *
 * Server component that delegates rendering to a client child. We could
 * inline the client logic here with `"use client"`, but keeping the page
 * file as a server component lets us add server-side metadata and
 * (eventually) server-side data loading without restructuring.
 */
import type { Metadata } from "next";

import { DashboardClient } from "./_components/dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "OnPay merchant dashboard.",
};

export default function DashboardPage(): React.JSX.Element {
  return <DashboardClient />;
}
