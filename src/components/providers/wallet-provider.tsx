"use client";

/**
 * Solana Wallet Adapter provider.
 *
 * Wraps the app in the contexts needed for wallet connection. Two important
 * defaults are set here:
 *
 * 1. `wallets={[]}` — we deliberately rely on the Wallet Standard auto-
 *    detection rather than the umbrella `-wallets` package. Phantom,
 *    Backpack, Solflare, and any other modern wallet that announces itself
 *    via the standard will appear in `useWallet().wallets` automatically.
 *    This avoids dragging in 30+ vulnerable legacy adapter dependencies.
 *
 * 2. `onError` — swallows the firehose of expected errors the wallet adapter
 *    emits (user rejected a prompt, popup closed, extension locked, etc.).
 *    Without this handler, those errors become unhandled promise rejections
 *    and the Next.js dev overlay surfaces them as scary "[object Event]"
 *    runtime errors. None of them are actionable by us — the wallet extension
 *    already shows its own user-facing UI. We log at debug level for
 *    diagnostics during local development and otherwise move on.
 */
import {
  ConnectionProvider,
  WalletProvider as BaseWalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { useCallback, useMemo, type ReactNode } from "react";

import { publicEnv } from "@/config/env";

export function WalletProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Memoize so we don't reconstruct the connection on every render.
  const endpoint = useMemo(() => clusterApiUrl(publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER), []);

  // Stable onError so the provider isn't forced to re-run its internal
  // effects on every parent render.
  const handleWalletError = useCallback((error: unknown) => {
    // During local development, print a compact summary so we can spot
    // surprising failures without the Next.js dev overlay screaming.
    if (process.env.NODE_ENV !== "production") {
      const name =
        error !== null && typeof error === "object" && "name" in error
          ? String((error as { name: unknown }).name)
          : "UnknownError";
      const message =
        error !== null && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
      // Intentional: developer console output only, never user-facing.
      console.warn(`[wallet] ${name}: ${message}`);
    }
    // In production we drop the error silently — the wallet extension
    // already surfaces user-actionable feedback.
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <BaseWalletProvider wallets={[]} autoConnect onError={handleWalletError}>
        {children}
      </BaseWalletProvider>
    </ConnectionProvider>
  );
}
