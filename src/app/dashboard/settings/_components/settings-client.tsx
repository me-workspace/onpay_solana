"use client";

/**
 * Merchant settings form.
 *
 * Lets a signed-in merchant edit:
 *   - business name (free text, shown on their dashboard header)
 *   - preferred language (en / id) — used for future localized receipts
 *   - settlement mint (SPL token mint the swap will settle into)
 *
 * Auth flow assumption: when a user lands here they are already signed in
 * via the dashboard home flow (wallet connect → nonce → verify → session
 * cookie). This page re-verifies that by calling GET /api/merchants on
 * mount — a 401/404 response bounces them back to /dashboard where the
 * full sign-in flow runs.
 *
 * The form POSTs to /api/merchants (the existing upsert endpoint) so
 * there is no new write path to secure — we reuse the same Zod schema
 * and rate-limiter already in place server-side.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Logo } from "@/components/brand/logo";
import { ConnectWalletButton } from "@/components/wallet/connect-button";
import {
  ApiClientError,
  getMerchantMeApi,
  upsertMerchantApi,
  type MerchantApi,
} from "@/lib/api-client";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
] as const;

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; merchant: MerchantApi }
  | { kind: "error"; message: string };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function SettingsClient(): React.JSX.Element {
  const router = useRouter();
  const { connected } = useWallet();

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  // Form fields — populated from the server response on mount.
  const [businessName, setBusinessName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "id">("en");
  const [settlementMint, setSettlementMint] = useState("");

  useEffect(() => {
    // If we somehow got here without a wallet connected, kick back to
    // the dashboard home — it owns the sign-in flow.
    if (!connected) {
      setLoadState({ kind: "loading" });
      return;
    }

    const controller = new AbortController();
    getMerchantMeApi(controller.signal)
      .then((merchant) => {
        if (controller.signal.aborted) return;
        setLoadState({ kind: "loaded", merchant });
        setBusinessName(merchant.businessName ?? "");
        setPreferredLanguage(merchant.preferredLanguage);
        setSettlementMint(merchant.settlementMint);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        // 401 / 404 means the user isn't signed in or isn't registered —
        // send them through the dashboard flow which will create the row.
        if (cause instanceof ApiClientError && (cause.status === 401 || cause.status === 404)) {
          router.push("/dashboard");
          return;
        }
        const message =
          cause instanceof ApiClientError ? cause.message : "Failed to load settings.";
        setLoadState({ kind: "error", message });
      });
    return () => {
      controller.abort();
    };
  }, [connected, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveState({ kind: "saving" });
    try {
      const trimmed = businessName.trim();
      const merchant = await upsertMerchantApi({
        businessName: trimmed.length > 0 ? trimmed : null,
        preferredLanguage,
        settlementMint: settlementMint.trim(),
      });
      setLoadState({ kind: "loaded", merchant });
      setSaveState({ kind: "saved" });
      // Clear the "Saved" pill after a couple of seconds.
      setTimeout(() => {
        setSaveState({ kind: "idle" });
      }, 2_000);
    } catch (cause: unknown) {
      const message =
        cause instanceof ApiClientError ? cause.message : "Failed to save settings. Try again.";
      setSaveState({ kind: "error", message });
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-tight flex items-center justify-between gap-3 py-4">
          <Link href="/dashboard" aria-label="OnPay home" className="inline-flex items-center">
            <Logo height={30} priority />
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <section className="container-tight max-w-xl py-8 sm:py-12">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Settings</h1>
        <p className="mt-2 text-slate-600">
          Update your merchant profile. Changes are saved on your own wallet record; no one else can
          edit these fields.
        </p>

        {!connected ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">Connect a wallet to edit your settings.</p>
            <div className="mt-4 flex justify-center">
              <ConnectWalletButton />
            </div>
          </div>
        ) : loadState.kind === "loading" ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            Loading…
          </div>
        ) : loadState.kind === "error" ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="font-medium text-red-900">Could not load settings</p>
            <p className="mt-2 text-sm text-red-700">{loadState.message}</p>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
          >
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-slate-700">
                Business name <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(event) => {
                  setBusinessName(event.target.value);
                }}
                placeholder="Warung Kopi Ubud"
                maxLength={200}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Shown on your dashboard and on receipts.
              </p>
            </div>

            <div>
              <label
                htmlFor="preferredLanguage"
                className="block text-sm font-medium text-slate-700"
              >
                Preferred language
              </label>
              <select
                id="preferredLanguage"
                value={preferredLanguage}
                onChange={(event) => {
                  setPreferredLanguage(event.target.value as "en" | "id");
                }}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settlementMint" className="block text-sm font-medium text-slate-700">
                Settlement token mint
              </label>
              <input
                id="settlementMint"
                type="text"
                value={settlementMint}
                onChange={(event) => {
                  setSettlementMint(event.target.value);
                }}
                placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                minLength={32}
                maxLength={44}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                SPL mint address every invoice will settle into. Default is USDC. Only change this
                if you know what you&apos;re doing.
              </p>
            </div>

            {saveState.kind === "error" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {saveState.message}
              </div>
            ) : null}

            {saveState.kind === "saved" ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                Settings saved.
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button
                type="submit"
                disabled={saveState.kind === "saving"}
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
              >
                {saveState.kind === "saving" ? "Saving…" : "Save changes"}
              </button>
              <Link
                href="/dashboard"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:w-auto"
              >
                Cancel
              </Link>
            </div>

            <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
              <p>
                Wallet:{" "}
                <span className="font-mono">
                  {loadState.merchant.walletAddress.slice(0, 6)}…
                  {loadState.merchant.walletAddress.slice(-6)}
                </span>
              </p>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
