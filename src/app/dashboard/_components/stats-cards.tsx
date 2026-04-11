"use client";

/**
 * Dashboard analytics cards: today / last 7 days / last 30 days totals.
 *
 * Fetches /api/merchants/me/stats on mount. Shows three cards with the
 * formatted USD total and transaction count. Zero state renders
 * "$0.00 · 0 payments" cleanly instead of an empty placeholder.
 */
import { useEffect, useState } from "react";

import { ApiClientError, getMerchantStatsApi, type StatsResponse } from "@/lib/api-client";

type StatsState =
  | { kind: "loading" }
  | { kind: "loaded"; stats: StatsResponse }
  | { kind: "error"; message: string };

export function StatsCards(): React.JSX.Element {
  const [state, setState] = useState<StatsState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getMerchantStatsApi(controller.signal)
      .then((stats) => {
        if (controller.signal.aborted) return;
        setState({ kind: "loaded", stats });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const message = cause instanceof ApiClientError ? cause.message : "Failed to load stats.";
        setState({ kind: "error", message });
      });
    return () => {
      controller.abort();
    };
  }, []);

  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const isLoading = state.kind === "loading";
  const stats = state.kind === "loaded" ? state.stats : null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card label="Today" value={stats?.today} loading={isLoading} currency={stats?.currency} />
      <Card
        label="Last 7 days"
        value={stats?.week}
        loading={isLoading}
        currency={stats?.currency}
      />
      <Card
        label="Last 30 days"
        value={stats?.month}
        loading={isLoading}
        currency={stats?.currency}
      />
    </div>
  );
}

function Card({
  label,
  value,
  loading,
  currency,
}: {
  label: string;
  value: { totalFormatted: string; count: number } | null | undefined;
  loading: boolean;
  currency: string | undefined;
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
        {loading ? (
          <span className="inline-block h-8 w-24 animate-pulse rounded bg-slate-100" />
        ) : (
          <>
            {value?.totalFormatted ?? "0.00"}{" "}
            <span className="text-base font-medium text-slate-400">{currency ?? "USD"}</span>
          </>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {loading ? "\u00a0" : `${String(value?.count ?? 0)} payments`}
      </div>
    </div>
  );
}
