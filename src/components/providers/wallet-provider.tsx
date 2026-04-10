"use client";

/**
 * Solana Wallet Adapter provider — wraps the app in the contexts needed for
 * wallet connection. We deliberately use the modern Wallet Standard auto-
 * detection (`wallets={[]}`) rather than the umbrella `-wallets` package,
 * which drags in dozens of legacy wallet adapters and 30+ vulnerabilities.
 *
 * Phantom, Backpack, Solflare, and any other modern wallet that announces
 * itself via the standard will appear in `useWallet().wallets` automatically.
 */
import {
  ConnectionProvider,
  WalletProvider as BaseWalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo, type ReactNode } from "react";

import { publicEnv } from "@/config/env";

export function WalletProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Memoize so we don't reconstruct the connection on every render.
  const endpoint = useMemo(() => clusterApiUrl(publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <BaseWalletProvider wallets={[]} autoConnect>
        {children}
      </BaseWalletProvider>
    </ConnectionProvider>
  );
}
