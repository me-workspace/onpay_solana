"use client";

/**
 * Wallet connect button — minimal, no dependency on @solana/wallet-adapter-react-ui.
 *
 * IMPORTANT: this component renders different UI depending on whether a
 * Solana wallet extension is installed in the browser. On the Next.js server
 * the wallet standard registry is empty (`wallets.length === 0`), but on the
 * client it fills in with Phantom/Backpack/Solflare/etc. That difference
 * causes a React hydration mismatch if we render the real output during the
 * initial pass.
 *
 * The fix is the standard "mounted gate" pattern: render a neutral, stable
 * placeholder on the server and during the first hydration pass, then swap
 * to the live output after the first client-side effect tick. The placeholder
 * is intentionally the same size and shape as the real button so the layout
 * doesn't shift.
 *
 * We also:
 *   - Do NOT run a manual auto-connect effect (that's the job of the
 *     provider's `autoConnect` prop).
 *   - Call `disconnect` / `select` via the context object (not destructured)
 *     so `this` binding stays intact.
 *
 * Tailwind only — no third-party CSS bundles.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";

/**
 * How long we'll wait for a `connect()` call to resolve before showing the
 * user a "stuck — click to cancel" escape hatch. 10 seconds is long enough
 * to let Phantom show its approval popup and for a human to actually read
 * it, but short enough that an extension in a broken state is obvious.
 */
const CONNECTING_STUCK_MS = 10_000;

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Neutral placeholder rendered during SSR + first hydration pass. */
function Placeholder(): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="inline-flex h-[42px] w-[148px] items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400"
    >
      …
    </div>
  );
}

export function ConnectWalletButton(): React.JSX.Element {
  const walletCtx = useWallet();
  const { wallets, publicKey, connecting, connected } = walletCtx;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [stuck, setStuck] = useState(false);

  // Flip after the first client-side render so we can safely diverge from
  // the server HTML without tripping React hydration.
  useEffect(() => {
    setMounted(true);
  }, []);

  // If `connecting` stays true for too long, we assume the wallet extension
  // has entered a broken state (service worker killed, popup dismissed
  // without resolving, extension reloaded mid-flight). Surface an escape
  // hatch so the user isn't trapped watching a spinner forever.
  useEffect(() => {
    if (!connecting) {
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => {
      setStuck(true);
    }, CONNECTING_STUCK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [connecting]);

  const handleDisconnect = useCallback(() => {
    void walletCtx.disconnect().catch(() => {
      // Swallowed — provider's onError handler logs the details.
    });
  }, [walletCtx]);

  const handleCancelStuck = useCallback(() => {
    setStuck(false);
    // Best effort: tell the adapter to disconnect. If its internal state
    // is fully broken (Chrome extension context invalidated), this may
    // still throw — that's fine, the onError handler swallows it.
    void walletCtx.disconnect().catch(() => {
      // ignored
    });
  }, [walletCtx]);

  const handleSelect = useCallback(
    (name: Parameters<typeof walletCtx.select>[0]) => {
      walletCtx.select(name);
      setOpen(false);
    },
    [walletCtx],
  );

  // Server and first-pass client render the same neutral placeholder.
  if (!mounted) return <Placeholder />;

  if (connected && publicKey !== null) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-brand-50 px-3 py-1.5 font-mono text-xs text-brand-700">
          {truncate(publicKey.toBase58())}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
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

  if (stuck) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Connection stuck. Your wallet extension may have reloaded. Try
          <span className="mx-1 font-mono">Ctrl+F5</span>
          to hard-reload the tab.
        </div>
        <button
          type="button"
          onClick={handleCancelStuck}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
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
                    handleSelect(entry.adapter.name);
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
