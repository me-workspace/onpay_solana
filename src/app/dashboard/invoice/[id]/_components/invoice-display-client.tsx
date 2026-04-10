"use client";

/**
 * Invoice display + status polling.
 *
 * Renders the Solana Pay payment URL as a QR code and polls the invoice
 * endpoint every 2 seconds for status changes. When the status flips to
 * "paid" the screen swaps to a confirmation view automatically.
 *
 * Polling stops as soon as the invoice transitions to a terminal state
 * (paid / expired / failed) so we don't burn requests forever.
 */
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { ConnectWalletButton } from "@/components/wallet/connect-button";
import { ApiClientError, getInvoiceApi, type InvoiceApi } from "@/lib/api-client";

const POLL_INTERVAL_MS = 2_000;

type DisplayState =
  | { kind: "loading" }
  | { kind: "loaded"; invoice: InvoiceApi }
  | { kind: "error"; message: string };

function isTerminal(status: InvoiceApi["status"]): boolean {
  return status === "paid" || status === "expired" || status === "failed";
}

export function InvoiceDisplayClient({ invoiceId }: { invoiceId: string }): React.JSX.Element {
  const [state, setState] = useState<DisplayState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function poll(): Promise<void> {
      try {
        const invoice = await getInvoiceApi(invoiceId, controller.signal);
        if (cancelled) return;
        setState({ kind: "loaded", invoice });
        if (isTerminal(invoice.status)) return;
        setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      } catch (cause: unknown) {
        if (cancelled || (cause instanceof DOMException && cause.name === "AbortError")) return;
        const message = cause instanceof ApiClientError ? cause.message : "Failed to load invoice.";
        setState({ kind: "error", message });
      }
    }

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [invoiceId]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-tight flex items-center justify-between py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
            OnPay
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <section className="container-tight max-w-2xl py-12">
        {state.kind === "loading" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600">
            Loading invoice…
          </div>
        ) : state.kind === "error" ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-12 text-center">
            <h2 className="text-xl font-semibold text-red-900">Could not load invoice</h2>
            <p className="mt-2 text-red-700">{state.message}</p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Back to dashboard
            </Link>
          </div>
        ) : state.invoice.status === "paid" ? (
          <PaidView invoice={state.invoice} />
        ) : state.invoice.status === "expired" ? (
          <ExpiredView invoice={state.invoice} />
        ) : state.invoice.status === "failed" ? (
          <FailedView invoice={state.invoice} />
        ) : (
          <PendingView invoice={state.invoice} />
        )}
      </section>
    </main>
  );
}

function PendingView({ invoice }: { invoice: InvoiceApi }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Awaiting payment</p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">
        {invoice.amount.formatted} {invoice.amount.currency}
      </h1>
      {invoice.label !== null ? <p className="mt-1 text-slate-600">{invoice.label}</p> : null}

      <div className="mt-8 flex justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <QRCodeSVG value={invoice.paymentUrl} size={280} level="M" />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-slate-600">
        Scan with any Solana Pay-compatible wallet (Phantom, Backpack, Solflare).
      </p>
      <p className="mt-1 text-center font-mono text-xs text-slate-400">
        ref: {invoice.reference.slice(0, 8)}…
      </p>

      <div className="mt-8 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          Polling for confirmation…
        </span>
      </div>
    </div>
  );
}

function PaidView({ invoice }: { invoice: InvoiceApi }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white">
        ✓
      </div>
      <h1 className="mt-6 text-3xl font-bold text-slate-900">
        Paid {invoice.amount.formatted} {invoice.amount.currency}
      </h1>
      {invoice.label !== null ? <p className="mt-2 text-slate-600">{invoice.label}</p> : null}
      <Link
        href="/dashboard"
        className="mt-8 inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function ExpiredView({ invoice }: { invoice: InvoiceApi }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Invoice expired</h1>
      <p className="mt-2 text-slate-600">
        This invoice for {invoice.amount.formatted} {invoice.amount.currency} is no longer payable.
      </p>
      <Link
        href="/dashboard/new"
        className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Create a new payment
      </Link>
    </div>
  );
}

function FailedView({ invoice }: { invoice: InvoiceApi }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-12 text-center">
      <h1 className="text-2xl font-bold text-red-900">Payment failed</h1>
      <p className="mt-2 text-red-700">
        Something went wrong with this payment ({invoice.amount.formatted} {invoice.amount.currency}
        ). Try creating a new invoice.
      </p>
      <Link
        href="/dashboard/new"
        className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Create a new payment
      </Link>
    </div>
  );
}
