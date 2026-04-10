"use client";

/**
 * Dashboard client root.
 *
 * Watches the wallet connection state. When a wallet connects:
 *   1. Calls POST /api/merchants to upsert a merchant record (idempotent).
 *   2. Stores the merchant in local state.
 *   3. Renders the dashboard CTAs.
 *
 * When disconnected, shows an empty state with the connect button.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ConnectWalletButton } from "@/components/wallet/connect-button";
import { ApiClientError, upsertMerchantApi, type MerchantApi } from "@/lib/api-client";

type RegistrationState =
  | { kind: "idle" }
  | { kind: "registering" }
  | { kind: "ready"; merchant: MerchantApi }
  | { kind: "error"; message: string };

export function DashboardClient(): React.JSX.Element {
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<RegistrationState>({ kind: "idle" });

  useEffect(() => {
    if (!connected || publicKey === null) {
      setState({ kind: "idle" });
      return;
    }

    const walletAddress = publicKey.toBase58();
    setState({ kind: "registering" });

    let cancelled = false;
    upsertMerchantApi({ walletAddress })
      .then((merchant) => {
        if (cancelled) return;
        setState({ kind: "ready", merchant });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message =
          cause instanceof ApiClientError
            ? cause.message
            : "Failed to register merchant. Check your connection.";
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-tight flex items-center justify-between py-4">
          <Link href="/" className="text-lg font-semibold text-slate-900">
            OnPay
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <section className="container-tight py-12">
        {!connected ? (
          <DisconnectedState />
        ) : state.kind === "registering" ? (
          <LoadingState message="Registering merchant…" />
        ) : state.kind === "error" ? (
          <ErrorState message={state.message} />
        ) : state.kind === "ready" ? (
          <ReadyState merchant={state.merchant} />
        ) : (
          <LoadingState message="Loading…" />
        )}
      </section>
    </main>
  );
}

function DisconnectedState(): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
      <h1 className="text-3xl font-bold text-slate-900">Connect a wallet to continue</h1>
      <p className="mx-auto mt-3 max-w-md text-slate-600">
        Your Solana wallet is your OnPay merchant account. No password, no email, no signup.
        Phantom, Backpack, and Solflare all work.
      </p>
      <div className="mt-8 flex justify-center">
        <ConnectWalletButton />
      </div>
    </div>
  );
}

function LoadingState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-12 text-center">
      <h2 className="text-xl font-semibold text-red-900">Something went wrong</h2>
      <p className="mt-2 text-red-700">{message}</p>
    </div>
  );
}

function ReadyState({ merchant }: { merchant: MerchantApi }): React.JSX.Element {
  const truncated = `${merchant.walletAddress.slice(0, 6)}…${merchant.walletAddress.slice(-6)}`;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Welcome</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {merchant.businessName ?? "Your merchant account"}
        </h1>
        <p className="mt-2 font-mono text-xs text-slate-500">{truncated}</p>
        <p className="mt-6 text-slate-600">
          You&apos;re ready to accept payments. Settlement token:{" "}
          <span className="font-mono text-xs">{merchant.settlementMint.slice(0, 6)}…</span>
        </p>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Next step</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Create a payment</h2>
        <p className="mt-2 text-slate-700">
          Generate a Solana Pay QR for any amount. Buyers scan, pick any token they hold, and you
          receive USDC in seconds.
        </p>
        <Link
          href="/dashboard/new"
          className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          New payment →
        </Link>
      </div>
    </div>
  );
}
