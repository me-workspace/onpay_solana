import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { WalletProvider } from "@/components/providers/wallet-provider";
import { publicEnv } from "@/config/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: "OnPay — Any-to-Stable Payments on Solana",
    template: "%s · OnPay",
  },
  description:
    "Non-custodial payment gateway on Solana. Pay in any SPL token, merchants receive USDC in under two seconds.",
  keywords: [
    "Solana",
    "Solana Pay",
    "USDC",
    "payments",
    "merchant",
    "non-custodial",
    "Jupiter",
    "SPL",
    "Bali",
  ],
  authors: [{ name: "OnPay" }],
  openGraph: {
    type: "website",
    title: "OnPay — Any-to-Stable Payments on Solana",
    description:
      "Non-custodial payment gateway on Solana. Pay in any SPL token, merchants receive USDC in under two seconds.",
    siteName: "OnPay",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
