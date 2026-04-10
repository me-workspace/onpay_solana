"use client";

/**
 * Wallet connect button — minimal, no dependency on @solana/wallet-adapter-react-ui.
 *
 * Behavior:
 *   - If no wallets are detected, shows a "No Solana wallet detected" hint.
 *   - If disconnected, shows a dropdown listing every wallet that's announced
 *     itself via the Wallet Standard (Phantom, Backpack, Solflare, etc.).
 *   - If connected, shows the truncated wallet address and a Disconnect button.
 *
 * Tailwind only — no third-party CSS bundles.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function ConnectWalletButton(): React.JSX.Element {
  // We deliberately do NOT destructure `select`/`connect`/`disconnect` from
  // useWallet — those are bound methods on the wallet adapter context, and
  // destructuring would trip @typescript-eslint/unbound-method. Calling them
  // through `wallet` keeps the `this` binding intact.
  const walletCtx = useWallet();
  const { wallets, wallet, publicKey, connecting, connected } = walletCtx;
  const [open, setOpen] = useState(false);

  // Auto-connect once a wallet is selected. We intentionally read
  // `walletCtx.connect` inside the effect rather than via the dependency
  // array — its identity changes on every render and we only want to
  // re-run when the connection state primitives change.
  useEffect(() => {
    if (wallet !== null && !connected && !connecting) {
      void walletCtx.connect().catch(() => {
        // Swallow — the wallet adapter shows its own error UI on user reject.
      });
    }
  }, [wallet, connected, connecting, walletCtx]);

  if (connected && publicKey !== null) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-brand-50 px-3 py-1.5 font-mono text-xs text-brand-700">
          {truncate(publicKey.toBase58())}
        </span>
        <button
          type="button"
          onClick={() => {
            void walletCtx.disconnect();
          }}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        No Solana wallet detected. Install{" "}
        <a
          className="underline"
          href="https://phantom.app"
          rel="noopener noreferrer"
          target="_blank"
        >
          Phantom
        </a>{" "}
        or{" "}
        <a
          className="underline"
          href="https://backpack.app"
          rel="noopener noreferrer"
          target="_blank"
        >
          Backpack
        </a>{" "}
        to continue.
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={connecting}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul className="divide-y divide-slate-100">
            {wallets.map((entry) => (
              <li key={entry.adapter.name}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    walletCtx.select(entry.adapter.name);
                    setOpen(false);
                  }}
                >
                  <img alt="" src={entry.adapter.icon} className="h-5 w-5" />
                  <span>{entry.adapter.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
