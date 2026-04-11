/**
 * Web app manifest.
 *
 * Served at /manifest.webmanifest. Next.js App Router picks this up via
 * the `manifest.ts` file convention and automatically injects the correct
 * <link rel="manifest"> into every page's <head>.
 *
 * The manifest is the last piece needed for Lighthouse's PWA scoring and
 * for iOS / Android "Add to Home Screen" flows.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OnPay — Any-to-Stable Payments on Solana",
    short_name: "OnPay",
    description:
      "Non-custodial payment gateway on Solana. Pay in any SPL token, merchants receive USDC in under two seconds.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/logo-mark.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
