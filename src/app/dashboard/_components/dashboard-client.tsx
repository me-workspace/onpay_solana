"use client";

/**
 * Dashboard client root.
 *
 * Flow when a wallet connects:
 *   1. Sign in with wallet: POST /api/auth/nonce → wallet signs the message
 *      → POST /api/auth/verify → server sets httpOnly session cookie.
 *   2. Upsert merchant profile: POST /api/merchants (auth-gated, reads
 *      the wallet from the session cookie).
 *   3. Render the dashboard with CTAs.
 *
 * If the wallet does not support signMessage (rare — Ledger via USB etc.)
 * we surface a clear error rather than silently fall back to unsafe mode.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { ConnectWalletButton } from "@/components/wallet/connect-button";
import { ApiClientError, upsertMerchantApi, type MerchantApi } from "@/lib/api-client";
import { useIsMobile } from "@/lib/use-is-mobile";
import { signInWithWallet } from "@/lib/wallet-auth-client";

import { InvoiceList } from "./invoice-list";
import { StatsCards } from "./stats-cards";

type RegistrationState =
  | { kind: "idle" }
  | { kind: "authenticating" }
  | { kind: "registering" }
  | { kind: "ready"; merchant: MerchantApi }
  | { kind: "error"; message: string };

export function DashboardClient(): React.JSX.Element {
  const walletCtx = useWallet();
  const { publicKey, connected, signMessage } = walletCtx;
  const [state, setState] = useState<RegistrationState>({ kind: "idle" });
  // Ref, not state, because we never want this to trigger re-renders.
  // It's also the cleanest way to signal "this effect's cleanup fired"
  // to the async callback the effect spawned.
  const effectRunIdRef = useRef(0);

  useEffect(() => {
    if (!connected || publicKey === null) {
      setState({ kind: "idle" });
      return;
    }
    if (signMessage === undefined) {
      setState({
        kind: "error",
        message:
          "This wallet does not support signMessage. Please use Phantom, Backpack, or Solflare.",
      });
      return;
    }

    const walletAddress = publicKey.toBase58();
    // Capture signMessage into a local non-optional reference so the
    // async closure below can use it without re-narrowing inside the
    // try block (TypeScript loses optional-prop narrowing across awaits).
    const signFn = signMessage;

    // Each time this effect fires, bump the run id. The async callback
    // captures the current id at spawn time and checks against the ref's
    // live value after every await — if they don't match, a newer effect
    // has superseded it and we silently abort.
    effectRunIdRef.current += 1;
    const myRunId = effectRunIdRef.current;
    const stillCurrent = (): boolean => effectRunIdRef.current === myRunId;

    async function run(): Promise<void> {
      try {
        setState({ kind: "authenticating" });
        await signInWithWallet(walletAddress, signFn);
        if (!stillCurrent()) return;

        setState({ kind: "registering" });
        const merchant = await upsertMerchantApi({});
        if (!stillCurrent()) return;
        setState({ kind: "ready", merchant });
      } catch (cause: unknown) {
        if (!stillCurrent()) return;
        const message =
          cause instanceof ApiClientError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "Failed to sign in. Please try again.";
        setState({ kind: "error", message });
      }
    }

    void run();

    return () => {
      // Bumping invalidates the captured `myRunId` for the spawned callback.
      effectRunIdRef.current += 1;
    };
  }, [connected, publicKey, signMessage]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-tight flex items-center justify-between gap-3 py-4">
          <Link href="/" aria-label="OnPay home" className="inline-flex items-center">
            <Logo height={30} priority />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            {connected ? (
              <Link
                href="/dashboard/settings"
                className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-900 sm:inline"
              >
                Settings
              </Link>
            ) : null}
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      <section className="container-tight py-8 sm:py-12">
        {!connected ? (
          <DisconnectedState />
        ) : state.kind === "authenticating" ? (
          <LoadingState message="Sign the message in your wallet to continue…" />
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
  const isMobile = useIsMobile();
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-12">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
        Connect a wallet to continue
      </h1>
      <p className="mx-auto mt-3 max-w-md text-slate-600">
        Your Solana wallet is your OnPay merchant account. No password, no email, no signup.
        Phantom, Backpack, and Solflare all work.
      </p>

      {isMobile ? (
        <div className="mx-auto mt-8 max-w-xs space-y-3">
          <p className="text-xs text-slate-500">
            Tap a wallet below to open OnPay in its in-app browser, where your wallet connects
            automatically.
          </p>
          <a
            href={`https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(currentUrl)}`}
            className="flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Open in Phantom
          </a>
          <div className="flex gap-3">
            <a
              href={`https://backpack.app/ul/browse/${encodeURIComponent(currentUrl)}`}
              className="flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Backpack
            </a>
            <a
              href={`https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(currentUrl)}`}
              className="flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Solflare
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex justify-center">
          <ConnectWalletButton />
        </div>
      )}
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
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Welcome back</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
          {merchant.businessName ?? "Your merchant account"}
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{truncated}</p>
      </div>

      <StatsCards />

      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create a payment</h2>
            <p className="mt-1 text-sm text-slate-700">
              Generate a Solana Pay QR for any amount. Buyers pay with any token; you receive USDC.
            </p>
          </div>
          <Link
            href="/dashboard/new"
            className="inline-flex w-full shrink-0 items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 sm:w-auto"
          >
            New payment →
          </Link>
        </div>
      </div>

      <InvoiceList />
    </div>
  );
}
