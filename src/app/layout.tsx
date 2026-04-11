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
  creator: "OnPay",
  publisher: "OnPay",
  openGraph: {
    type: "website",
    title: "OnPay — Any-to-Stable Payments on Solana",
    description:
      "Non-custodial payment gateway on Solana. Pay in any SPL token, merchants receive USDC in under two seconds.",
    siteName: "OnPay",
    locale: "en_US",
    url: publicEnv.NEXT_PUBLIC_APP_URL,
    // opengraph-image.png in src/app is auto-detected by Next.js — no
    // explicit `images` key needed. Next generates the appropriate meta
    // tags at build time.
  },
  twitter: {
    card: "summary_large_image",
    title: "OnPay — Any-to-Stable Payments on Solana",
    description:
      "Non-custodial payment gateway on Solana. Pay in any SPL token, merchants receive USDC in under two seconds.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: publicEnv.NEXT_PUBLIC_APP_URL,
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
