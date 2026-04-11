"use client";

/**
 * Create-invoice form.
 *
 * Validates input client-side, then POSTs to /api/invoices and redirects to
 * /dashboard/invoice/[id] on success. Server-side Zod validation is the
 * source of truth — these client checks just give faster feedback.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/brand/logo";
import { ConnectWalletButton } from "@/components/wallet/connect-button";
import { ApiClientError, createInvoiceApi } from "@/lib/api-client";

const SUPPORTED_CURRENCIES = ["USD", "IDR"] as const;
type Currency = (typeof SUPPORTED_CURRENCIES)[number];

type FormState = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

export function NewInvoiceClient(): React.JSX.Element {
  const router = useRouter();
  const { publicKey, connected } = useWallet();

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!connected || publicKey === null) return;

    // Client-side sanity checks (server validates authoritatively).
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      setState({ kind: "error", message: "Amount must be a positive number" });
      return;
    }
    if (Number(amount) <= 0) {
      setState({ kind: "error", message: "Amount must be greater than zero" });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const invoice = await createInvoiceApi({
        amountDecimal: amount,
        currency,
        label: label.length > 0 ? label : null,
        memo: memo.length > 0 ? memo : null,
      });
      router.push(`/dashboard/invoice/${invoice.id}`);
    } catch (cause: unknown) {
      const message =
        cause instanceof ApiClientError ? cause.message : "Failed to create invoice. Try again.";
      setState({ kind: "error", message });
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-tight flex items-center justify-between py-4">
          <Link href="/dashboard" aria-label="OnPay home" className="inline-flex items-center">
            <Logo height={30} priority />
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <section className="container-tight max-w-xl py-12">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">New payment</h1>
        <p className="mt-2 text-slate-600">
          Generate a Solana Pay QR. Buyers can pay with any SPL token; you receive USDC.
        </p>

        {!connected ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">Connect a wallet to create payments.</p>
            <div className="mt-4 flex justify-center">
              <ConnectWalletButton />
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-8"
          >
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-slate-700">
                Amount
              </label>
              <div className="mt-1 flex">
                <input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                  placeholder="4.00"
                  className="block w-full rounded-l-lg border border-slate-300 px-4 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <select
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value as Currency);
                  }}
                  className="block rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-4 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="label" className="block text-sm font-medium text-slate-700">
                Label <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="label"
                type="text"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
                placeholder="Iced Latte x2"
                maxLength={200}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label htmlFor="memo" className="block text-sm font-medium text-slate-700">
                Memo <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="memo"
                type="text"
                value={memo}
                onChange={(event) => {
                  setMemo(event.target.value);
                }}
                placeholder="Order #1234"
                maxLength={500}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {state.kind === "error" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {state.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={state.kind === "submitting"}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {state.kind === "submitting" ? "Creating…" : "Generate QR"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
