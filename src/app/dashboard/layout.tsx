/**
 * Dashboard-scoped layout.
 *
 * WalletProvider lives here instead of at the app root so the marketing
 * landing page doesn't ship the wallet-adapter JS bundle. Moving this
 * ~70KB of code off the landing page is a significant Lighthouse
 * Performance win: the landing page serves under `/` and has no need
 * for wallet context; only pages under `/dashboard/*` do.
 *
 * Any new routes that require `useWallet()` MUST live under this
 * `dashboard` segment, or be given their own wallet-provider wrapper.
 */
import type { ReactNode } from "react";

import { WalletProvider } from "@/components/providers/wallet-provider";

export default function DashboardSegmentLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return <WalletProvider>{children}</WalletProvider>;
}
