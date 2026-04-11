"use client";

/**
 * Global error boundary for all route segments.
 *
 * Next.js renders this component when an uncaught error is thrown during
 * render. It receives the error and a `reset` function to retry.
 *
 * We intentionally DO NOT display the error message or stack trace to users.
 * Internal errors are logged server-side. Users see a generic message with
 * a retry action.
 */
import { useEffect } from "react";

export default function RouteError({
  reset,
}: {
  error: Error;
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    // In production, surface this to Sentry or an equivalent error tracker.
    // For now, log to the browser console so developers can see it.
    // Using console.error is allowed by the lint config.
    console.error("Route error boundary triggered");
  }, []);

  return (
    <main className="min-h-screen">
      <section className="container-tight flex min-h-screen flex-col items-start justify-center py-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-700">Error</p>
        <h1 className="text-4xl font-bold text-slate-900">Something went wrong.</h1>
        <p className="mt-4 max-w-lg text-slate-600">
          We hit an unexpected error while rendering this page. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex items-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
