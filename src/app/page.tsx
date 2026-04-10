/**
 * Landing page — minimal placeholder for the foundation phase.
 *
 * Real marketing content ships in Week 3 of the plan. This page exists so
 * `next build` has a route and deployments succeed on day one.
 */
export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen">
      <section className="container-tight flex min-h-screen flex-col items-start justify-center py-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-600">OnPay</p>
        <h1 className="max-w-3xl text-5xl font-bold leading-tight text-slate-900 sm:text-6xl">
          Pay in any SPL token.
          <br />
          Merchants receive USDC.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          Non-custodial payment gateway on Solana. Under two seconds per transaction. Built for SMEs
          and local businesses.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://github.com/me-workspace/onpay_solana"
            className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            rel="noopener noreferrer"
            target="_blank"
          >
            View on GitHub
          </a>
          <a
            href="/api/health"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            System status
          </a>
        </div>
        <p className="mt-12 text-xs text-slate-400">
          v0.1.0 · foundation phase · Solana Frontier Hackathon 2026
        </p>
      </section>
    </main>
  );
}
