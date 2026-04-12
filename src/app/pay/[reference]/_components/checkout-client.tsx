"use client";

/**
 * Buyer-facing checkout client component.
 *
 * Displays the invoice amount, QR code, and status. Polls the public
 * `/api/pay/[reference]` endpoint every 2 seconds for status updates.
 * When the invoice transitions to a terminal state (paid / expired / failed),
 * polling stops automatically.
 *
 * This component does NOT include wallet connect or dashboard navigation
 * because it's designed for buyers, not merchants.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { CopyButton } from "@/components/ui/copy-button";
import { publicEnv } from "@/config/env";
import { useIsMobile } from "@/lib/use-is-mobile";

const QRCodeSVG = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), {
  ssr: false,
  loading: () => (
    <div className="mx-auto h-[280px] w-[280px] animate-pulse rounded-lg bg-slate-100" />
  ),
});

const POLL_INTERVAL_MS = 2_000;

/** Shape of the invoice data used by this component. */
export type CheckoutInvoice = {
  readonly id: string;
  readonly reference: string;
  readonly amount: {
    readonly raw: string;
    readonly formatted: string;
    readonly currency: string;
    readonly decimals: number;
  };
  readonly label: string | null;
  readonly memo: string | null;
  readonly status: "pending" | "paid" | "expired" | "failed";
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly paymentUrl: string;
  readonly qris?: {
    readonly qrisUrl: string;
    readonly grossAmountIdr: number;
    readonly status: string;
  } | null;
};

type DisplayState =
  | { kind: "loaded"; invoice: CheckoutInvoice }
  | { kind: "error"; message: string; invoice: CheckoutInvoice | null };

function isTerminal(status: CheckoutInvoice["status"]): boolean {
  return status === "paid" || status === "expired" || status === "failed";
}

/**
 * Fetch the invoice status from the public pay API endpoint.
 * Throws on non-2xx responses.
 */
async function fetchInvoiceByReference(
  reference: string,
  signal?: AbortSignal,
): Promise<CheckoutInvoice> {
  const requestInit: RequestInit = {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  };
  if (signal !== undefined) {
    requestInit.signal = signal;
  }
  const response = await fetch(`/api/pay/${encodeURIComponent(reference)}`, requestInit);
  if (!response.ok) {
    let message = `HTTP ${String(response.status)}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message !== undefined) {
        message = body.message;
      }
    } catch {
      // Ignore JSON parse failures on error responses.
    }
    throw new Error(message);
  }
  return (await response.json()) as CheckoutInvoice;
}

export function CheckoutClient({
  initialInvoice,
}: {
  readonly initialInvoice: CheckoutInvoice;
}): React.JSX.Element {
  const [state, setState] = useState<DisplayState>({
    kind: "loaded",
    invoice: initialInvoice,
  });

  const reference = initialInvoice.reference;

  useEffect(() => {
    // If the initial invoice is already terminal, don't poll.
    if (isTerminal(initialInvoice.status)) return;

    let cancelled = false;
    const controller = new AbortController();

    async function poll(): Promise<void> {
      try {
        const invoice = await fetchInvoiceByReference(reference, controller.signal);
        if (cancelled) return;
        setState({ kind: "loaded", invoice });
        if (isTerminal(invoice.status)) return;
        setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      } catch (cause: unknown) {
        if (cancelled || (cause instanceof DOMException && cause.name === "AbortError")) return;
        const message = cause instanceof Error ? cause.message : "Failed to load invoice.";
        setState((prev) => ({
          kind: "error",
          message,
          invoice: prev.kind === "loaded" ? prev.invoice : null,
        }));
      }
    }

    // Start the first poll after the interval — we already have initial data.
    const timer = setTimeout(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [initialInvoice.status, reference]);

  const invoice = state.kind === "loaded" ? state.invoice : state.invoice;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-tight flex items-center justify-center py-4">
          <Logo height={30} priority />
        </div>
      </header>

      <section className="container-tight max-w-2xl py-8 sm:py-12">
        {state.kind === "error" && invoice === null ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center sm:p-12">
            <h2 className="text-xl font-semibold text-red-900">Could not load invoice</h2>
            <p className="mt-2 text-red-700">{state.message}</p>
          </div>
        ) : invoice === null ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 sm:p-12">
            Loading invoice...
          </div>
        ) : invoice.status === "paid" ? (
          <PaidView invoice={invoice} />
        ) : invoice.status === "expired" ? (
          <ExpiredView invoice={invoice} />
        ) : invoice.status === "failed" ? (
          <FailedView invoice={invoice} />
        ) : (
          <PendingView invoice={invoice} />
        )}
      </section>

      <footer className="pb-8 text-center text-xs text-slate-400">Powered by OnPay</footer>
    </main>
  );
}

function PendingView({ invoice }: { readonly invoice: CheckoutInvoice }): React.JSX.Element {
  const isMobile = useIsMobile();
  const checkoutUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/${encodeURIComponent(invoice.reference)}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Awaiting payment</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
        {invoice.amount.formatted} {invoice.amount.currency}
      </h1>
      {invoice.label !== null ? <p className="mt-1 text-slate-600">{invoice.label}</p> : null}

      {invoice.qris?.qrisUrl != null ? (
        /* Dual QR layout: crypto + QRIS side by side (stacked on mobile). */
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Crypto QR */}
          <div className="flex flex-col items-center">
            <p className="mb-3 text-center text-sm font-medium text-slate-700">
              Pay with crypto wallet
            </p>
            <div className="w-full max-w-[280px] rounded-2xl border border-slate-200 bg-white p-4">
              <QRCodeSVG
                value={invoice.paymentUrl}
                size={240}
                level="M"
                className="mx-auto block h-auto w-full max-w-[240px]"
              />
            </div>
            {isMobile ? (
              <a
                href={invoice.paymentUrl}
                className="mt-3 inline-flex w-full max-w-[240px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Open in wallet app
              </a>
            ) : (
              <p className="mt-3 text-center text-xs text-slate-500">
                Scan with Phantom, Backpack, or Solflare
              </p>
            )}
          </div>

          {/* QRIS QR */}
          <div className="flex flex-col items-center">
            <p className="mb-3 text-center text-sm font-medium text-slate-700">Pay with QRIS</p>
            <div className="w-full max-w-[280px] rounded-2xl border border-slate-200 bg-white p-4">
              {/* Midtrans returns a hosted QR image URL -- next/image is not needed. */}
              <img
                src={invoice.qris.qrisUrl}
                alt="QRIS QR code for payment"
                width={240}
                height={240}
                className="mx-auto block h-auto w-full max-w-[240px]"
              />
            </div>
            <p className="mt-3 text-center text-xs font-medium text-slate-600">
              Rp {new Intl.NumberFormat("id-ID").format(invoice.qris.grossAmountIdr)}
            </p>
            <p className="mt-1 text-center text-xs text-slate-500">
              GoPay, OVO, DANA, ShopeePay, Bank
            </p>
          </div>
        </div>
      ) : (
        /* Single QR layout: crypto only (original behavior). */
        <>
          <div className="mt-8 flex justify-center">
            <div className="w-full max-w-[320px] rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
              <QRCodeSVG
                value={invoice.paymentUrl}
                size={280}
                level="M"
                className="mx-auto block h-auto w-full max-w-[280px]"
              />
            </div>
          </div>

          {isMobile ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <a
                href={invoice.paymentUrl}
                className="inline-flex w-full max-w-xs items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Open in wallet app
              </a>
              <p className="max-w-xs text-center text-xs text-slate-500">
                Or share the QR with someone else to scan from their phone.
              </p>
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-slate-600">
              Scan with any Solana Pay-compatible wallet (Phantom, Backpack, Solflare).
            </p>
          )}
        </>
      )}

      {/* Copy checkout link — useful when sharing remotely. */}
      <div className="mt-5 flex justify-center gap-3">
        <CopyButton value={checkoutUrl} label="Copy payment link" />
      </div>

      {/* Gas fee notice */}
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5 text-center text-xs text-slate-500">
        Any SPL token accepted. Network fee covered by OnPay.
      </div>

      <p className="mt-4 text-center font-mono text-xs text-slate-400">
        ref: {invoice.reference.slice(0, 8)}...
      </p>

      <div className="mt-8 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          Polling for confirmation...
        </span>
      </div>
    </div>
  );
}

function PaidView({ invoice }: { readonly invoice: CheckoutInvoice }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center sm:p-12">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className="h-8 w-8"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-bold text-slate-900">
        Paid {invoice.amount.formatted} {invoice.amount.currency}
      </h1>
      {invoice.label !== null ? <p className="mt-2 text-slate-600">{invoice.label}</p> : null}
      <p className="mt-4 text-sm text-slate-500">
        Your payment has been confirmed. You can close this page.
      </p>
    </div>
  );
}

function ExpiredView({ invoice }: { readonly invoice: CheckoutInvoice }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-12">
      <h1 className="text-2xl font-bold text-slate-900">Invoice expired</h1>
      <p className="mt-2 text-slate-600">
        This invoice for {invoice.amount.formatted} {invoice.amount.currency} is no longer payable.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Please contact the merchant for a new payment link.
      </p>
    </div>
  );
}

function FailedView({ invoice }: { readonly invoice: CheckoutInvoice }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center sm:p-12">
      <h1 className="text-2xl font-bold text-red-900">Payment failed</h1>
      <p className="mt-2 text-red-700">
        Something went wrong with this payment ({invoice.amount.formatted} {invoice.amount.currency}
        ). Please contact the merchant for assistance.
      </p>
    </div>
  );
}
