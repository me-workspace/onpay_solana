"use client";

/**
 * Recent invoices table for the dashboard home view.
 *
 * Fetches from GET /api/invoices (auth-gated) once on mount and after the
 * `refreshKey` prop changes — the parent bumps that key after creating a
 * new invoice so the list refreshes without a full page reload.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiClientError, listInvoicesApi, type InvoiceApi } from "@/lib/api-client";

type ListState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "loaded"; invoices: readonly InvoiceApi[] }
  | { kind: "error"; message: string };

export function InvoiceList({ refreshKey = 0 }: { refreshKey?: number }): React.JSX.Element {
  const [state, setState] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    listInvoicesApi({ limit: 20 }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.invoices.length === 0) {
          setState({ kind: "empty" });
        } else {
          setState({ kind: "loaded", invoices: response.invoices });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const message =
          cause instanceof ApiClientError ? cause.message : "Failed to load invoices.";
        setState({ kind: "error", message });
      });
    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Recent payments</h2>
        <Link
          href="/dashboard/new"
          className="text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          New payment →
        </Link>
      </div>

      {state.kind === "loading" ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : state.kind === "error" ? (
        <p className="py-8 text-center text-sm text-red-700">{state.message}</p>
      ) : state.kind === "empty" ? (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-600">No payments yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            Create your first invoice to see it appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-3 pr-4">Amount</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Label</th>
                <th className="pb-3 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.invoices.map((invoice) => (
                <tr key={invoice.id} className="text-slate-700">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/dashboard/invoice/${invoice.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {invoice.amount.formatted} {invoice.amount.currency}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{invoice.label ?? "—"}</td>
                  <td className="py-3 text-right text-xs text-slate-500">
                    {formatRelativeTime(invoice.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: InvoiceApi["status"] }): React.JSX.Element {
  const styles: Record<InvoiceApi["status"], string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
    expired: "bg-slate-100 text-slate-600 ring-slate-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/** Tiny relative-time formatter so we don't pull in a date library. */
function formatRelativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  const nowMs = Date.now();
  const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (diffSec < 60) return `${String(diffSec)}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${String(diffMin)}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${String(diffHr)}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${String(diffDay)}d ago`;
}
