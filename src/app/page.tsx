/**
 * Marketing landing page.
 *
 * Server component — no client JS needed. This is the first impression
 * for hackathon judges, merchants, and anyone who finds the repo. Keep
 * it honest, specific, and fast.
 */
import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-white">
      {/* Top nav */}
      <header className="border-b border-slate-100">
        <div className="container-tight flex items-center justify-between py-4">
          <Link href="/" aria-label="OnPay home" className="inline-flex items-center">
            <Logo height={32} priority />
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <a
              href="#how-it-works"
              className="hidden text-slate-600 transition hover:text-slate-900 sm:block"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hidden text-slate-600 transition hover:text-slate-900 sm:block"
            >
              Features
            </a>
            <a
              href="https://github.com/me-workspace/onpay_solana"
              className="hidden text-slate-600 transition hover:text-slate-900 sm:block"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container-tight py-16 sm:py-20 md:py-28">
        <div className="max-w-3xl">
          <p className="mb-4 inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-700 ring-1 ring-brand-200">
            Solana Frontier Hackathon 2026
          </p>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl md:text-7xl">
            Pay in any SPL token.
            <br />
            <span className="text-brand-600">Merchants receive USDC.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-slate-600 sm:text-lg md:text-xl">
            OnPay is a non-custodial payment gateway on Solana. Buyers scan a QR, pick any token
            they already hold, and sign once — the merchant&apos;s wallet receives USDC in under two
            seconds. Atomically.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Start accepting payments →
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Connect your Solana wallet — no email, no password, no KYC.
          </p>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-y border-slate-100 bg-slate-50">
        <div className="container-tight grid grid-cols-2 gap-6 py-10 sm:grid-cols-4">
          <Stat value="<2s" label="Settlement" />
          <Stat value="<$0.01" label="Network fee per tx" />
          <Stat value="50+" label="Supported tokens" />
          <Stat value="0%" label="Custody risk" />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container-tight py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">
            How it works
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            One signature. Three programs. Done.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Every payment is a single atomic Solana transaction composed of a Jupiter swap and an
            SPL transfer. Either both steps succeed, or neither does. OnPay never touches the funds
            in between.
          </p>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          <Step
            n="1"
            title="Merchant creates an invoice"
            body="Enter an amount in USD or IDR. We generate a Solana Pay QR with an unguessable reference key. Takes 10 seconds."
          />
          <Step
            n="2"
            title="Buyer scans and picks a token"
            body="Phantom, Backpack, or Solflare reads the QR, fetches the transaction, shows the buyer what they're about to sign. Buyer picks SOL, BONK, USDC — whatever they already hold."
          />
          <Step
            n="3"
            title="Merchant gets USDC in <2s"
            body="Jupiter swaps the input token directly into the merchant's USDC account inside the same transaction. No holding period, no custody, no chargebacks."
          />
        </ol>
      </section>

      {/* Features grid */}
      <section id="features" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="container-tight">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">
              Built for real businesses
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Everything a merchant actually needs.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Feature
              title="Non-custodial"
              body="Funds flow directly from buyer to merchant wallet inside one atomic transaction. OnPay's servers never hold your money, not even for a millisecond."
            />
            <Feature
              title="Any token in"
              body="Jupiter routes 50+ SPL tokens to USDC at the best available price. Buyers spend whatever they hold; merchants always receive stable."
            />
            <Feature
              title="USDC out"
              body="Settlement always lands as USDC in your own wallet. Zero volatility exposure, same-unit accounting, compatible with every Solana exchange."
            />
            <Feature
              title="Sub-0.5% fees"
              body="Solana network fees are fractions of a cent. OnPay's protocol fee will be 0.2–0.5% at launch — still 4–5x cheaper than card processors."
            />
            <Feature
              title="Wallet-based auth"
              body="Connect Phantom or Backpack, sign a nonce, you're in. No password, no email, no KYC. Your wallet is your merchant account."
            />
            <Feature
              title="Open source"
              body="MIT licensed, fully on GitHub. Fork it, embed it, extend it. A TypeScript SDK ships after the hackathon for Shopify and WooCommerce integrations."
            />
          </div>
        </div>
      </section>

      {/* Why Solana */}
      <section className="container-tight py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">
              Why Solana
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              OnPay can only exist on Solana.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Sub-cent fees mean a $0.50 coffee purchase is economically viable. Sub-2-second
              finality is the minimum bar for in-person retail. Jupiter&apos;s aggregated liquidity
              covers 50+ SPL tokens out of the box. Solana Pay is a standardized QR spec every major
              wallet already supports. No other chain has this combination — and OnPay is the
              reference implementation that ties it all together.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-8 text-slate-100">
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">▶</span>
                <span className="text-slate-400">Buyer signs once</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">▶</span>
                <span className="text-slate-400">Jupiter swap executes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">▶</span>
                <span className="text-slate-400">USDC lands in merchant ATA</span>
              </div>
              <div className="mt-6 border-t border-slate-700 pt-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span className="text-emerald-300">Confirmed in ~1.2s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-100 bg-brand-700 py-20 text-white">
        <div className="container-tight text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Start accepting crypto in 60 seconds.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white">
            Connect your Solana wallet and generate your first payment QR. No setup, no signup.
          </p>
          <div className="mt-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-medium text-brand-700 transition hover:bg-slate-50"
            >
              Open dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="container-tight flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            © 2026 OnPay · MIT licensed · Built for the Solana Frontier Hackathon
          </p>
          <div className="flex items-center gap-6 text-xs">
            <a
              href="https://github.com/me-workspace/onpay_solana"
              className="text-slate-500 transition hover:text-slate-900"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            <a href="/api/health" className="text-slate-500 transition hover:text-slate-900">
              System status
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div>
      <div className="text-3xl font-bold text-slate-900 sm:text-4xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }): React.JSX.Element {
  return (
    <li className="relative rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700 ring-1 ring-brand-200">
        {n}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </li>
  );
}

function Feature({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
