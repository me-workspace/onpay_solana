"use client";

/**
 * Reusable "copy to clipboard" button.
 *
 * Uses the async Clipboard API (`navigator.clipboard.writeText`) which is
 * available in all modern browsers under HTTPS. We do NOT fall back to the
 * deprecated `document.execCommand("copy")` path — OnPay is served over
 * HTTPS in production and we don't want to ship a legacy branch for edge
 * cases that in practice never happen.
 *
 * Accessibility:
 *   - The live-region `<span role="status" aria-live="polite">` announces
 *     success to screen readers without moving focus.
 *   - The button text itself is static ("Copy"); success is communicated
 *     by the adjacent status node so assistive tech and sighted users see
 *     the same feedback.
 *
 * State resets after `FEEDBACK_MS` so the button is ready for another copy.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const FEEDBACK_MS = 2_000;

type CopyState = "idle" | "copied" | "error";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied!",
  className,
}: {
  /** The string to write to the clipboard. */
  readonly value: string;
  /** Default button label. */
  readonly label?: string;
  /** Label shown briefly after a successful copy. */
  readonly copiedLabel?: string;
  /** Extra classes appended after the base button styles. */
  readonly className?: string;
}): React.JSX.Element {
  const [state, setState] = useState<CopyState>("idle");
  // Track the timeout so we can clear it on unmount or on a rapid re-click.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    // Guard against SSR. `navigator.clipboard` is typed as always present
    // in TS's DOM lib, but in practice it can still be undefined on
    // insecure contexts (plain HTTP) — the runtime `.writeText` call will
    // reject in that case and we catch it below.
    if (typeof navigator === "undefined") {
      setState("error");
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setState("copied");
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setState("idle");
          timeoutRef.current = null;
        }, FEEDBACK_MS);
      })
      .catch(() => {
        setState("error");
      });
  }, [value]);

  const baseClasses =
    "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";
  const mergedClassName =
    className !== undefined && className.length > 0 ? `${baseClasses} ${className}` : baseClasses;

  return (
    <>
      <button type="button" onClick={handleClick} className={mergedClassName} aria-label={label}>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="h-4 w-4"
        >
          <rect x="6" y="6" width="10" height="10" rx="2" />
          <path d="M4 14V5a1 1 0 0 1 1-1h9" />
        </svg>
        <span>{state === "copied" ? copiedLabel : label}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied to clipboard" : state === "error" ? "Copy failed" : ""}
      </span>
    </>
  );
}
