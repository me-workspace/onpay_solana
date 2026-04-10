# OnPay

**Pay in any SPL token. Merchants receive USDC. In under two seconds. Non-custodial.**

OnPay is a decentralized payment gateway built on Solana that lets merchants accept any SPL token while receiving instant USDC settlement. Buyers scan a Solana Pay QR, pick whichever token they already hold (SOL, BONK, JUP, USDT, etc.), and sign once — the merchant's wallet receives USDC in under two seconds. All inside a single atomic transaction composed of a Jupiter swap and an SPL transfer. **OnPay's infrastructure never touches the funds.**

> Built for the **Solana Frontier Hackathon 2026** (Colosseum). Category: **Payments & Remittance**.

---

## Why OnPay

**For merchants** — SMEs and local businesses lose 2–3% per sale to card processors plus multi-day settlement. Existing crypto rails force them to hold volatile tokens or integrate custodial processors that reintroduce the exact fees crypto was supposed to eliminate. OnPay replaces the card reader with a printed QR sticker: **sub-0.5% fees, instant USDC settlement, no volatility exposure, no custody risk.**

**For buyers** — Crypto users hold fragmented portfolios (SOL, BONK, JUP, stablecoins). Existing payment apps demand one specific token the buyer usually doesn't have. OnPay accepts anything. **Scan, pick a token, tap approve. Done in under two seconds.**

**For the Solana ecosystem** — OnPay composes Solana Pay, Jupiter, and the SPL Token program into one atomic any-to-stable transaction. It's the reference implementation for non-custodial merchant payments on Solana.

---

## How it works

```
┌──────────┐    Solana Pay URL    ┌──────────────┐
│ Merchant │ ───────────────────► │   Buyer      │
│ Dashboard│       (QR scan)      │   Wallet     │
└─────┬────┘                      └──────┬───────┘
      │                                  │
      │ create invoice                   │ GET transaction
      ▼                                  ▼
┌─────────────────────────────────────────────┐
│  OnPay Backend (Next.js API routes)         │
│  - Solana Pay Transaction Request endpoint  │
│  - Jupiter v6 quote + swap instructions     │
│  - Builds atomic tx: swap → transfer        │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  Solana (on-chain, single atomic tx)        │
│  1. Jupiter swap: buyer's SPL → USDC        │
│  2. SPL transfer: USDC → merchant wallet    │
└─────────────────────────────────────────────┘
```

Either both steps succeed and the merchant receives USDC, or the whole transaction reverts. No intermediate state, no held funds, no custodial risk.

---

## Tech stack

| Layer          | Stack                                                           |
| -------------- | --------------------------------------------------------------- |
| Chain          | Solana (devnet + mainnet-beta)                                  |
| Payment spec   | Solana Pay (Transaction Request)                                |
| Swap           | Jupiter v6 API                                                  |
| Smart contract | Anchor (Rust) — optional for MVP                                |
| Frontend       | Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Wallets        | Phantom, Backpack, Solflare via `@solana/wallet-adapter`        |
| Database       | Supabase (Postgres + RLS)                                       |
| Hosting        | Vercel                                                          |
| Testing        | Vitest + Playwright                                             |
| CI/CD          | GitHub Actions                                                  |

**AI pair-programming tools (disclosed):** Claude Code, v0.dev, Colosseum Copilot.

---

## Features (MVP)

- Merchant onboarding via wallet connect (no passwords, no KYC)
- Invoice creation with USD/IDR amount, label, memo
- Solana Pay QR code generation
- **Any-to-stable swap**: buyer pays in any SPL token → merchant receives USDC
- Real-time payment status updates in the merchant dashboard
- Transaction history with on-chain links
- Analytics: today / week / month totals
- Devnet + mainnet-beta environment toggle
- English + Bahasa Indonesia (i18n)
- Lighthouse-audited accessibility (target ≥95)

## Roadmap (post-hackathon)

- Fiat off-ramp to IDR (Indonesian Rupiah bank deposits)
- Subscription payments (recurring via Anchor program)
- TypeScript SDK (`@onpay/sdk`)
- E-commerce plugins: Shopify, WooCommerce, Wix
- Loyalty NFT rewards
- Native mobile merchant app

---

## Quick start

### Prerequisites

- Node.js 22+
- A Solana wallet (Phantom or Backpack) with devnet SOL
- Supabase project (free tier)
- Helius RPC key (or use default Solana RPC)

### Setup

```bash
git clone https://github.com/me-workspace/onpay_solana.git
cd onpay_solana
npm install
cp .env.example .env.local  # fill in your keys
npm run dev
```

Open http://localhost:3000, connect a wallet, and create your first invoice.

See [`docs/PLAN.md`](docs/PLAN.md) for the full development plan.

---

## Documentation

All project documentation lives in [`/docs`](./docs):

| File                                                      | Description                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| [`MEMORY.md`](docs/MEMORY.md)                             | Project memory — identity, architecture, stack, decisions log, risks |
| [`PRD.md`](docs/PRD.md)                                   | Full product requirements document (English)                         |
| [`PLAN.md`](docs/PLAN.md)                                 | 5-week implementation plan with weekly milestones                    |
| [`HACKATHON_SUBMISSION.md`](docs/HACKATHON_SUBMISSION.md) | Colosseum form answers                                               |
| [`WHITEPAPER.md`](docs/WHITEPAPER.md)                     | Comprehensive project document (business + technical)                |
| [`WHITEPAPER.pdf`](docs/WHITEPAPER.pdf)                   | Same whitepaper, PDF format                                          |

---

## Hackathon context

- **Event:** Solana Frontier Hackathon (Colosseum)
- **Contest period:** 2026-04-06 → 2026-05-11
- **Individual registration:** by 2026-05-04
- **Winners announced:** 2026-06-23
- **Category:** Payments & Remittance
- **Prizes:** Grand Champion $30k · Public Goods $10k · University $10k · +20 standout teams $10k each (CASH-SPL)

---

## License

MIT — see [LICENSE](./LICENSE). OnPay is open source and composable. Fork it, embed it, extend it.

---

## Acknowledgements

- **Solana Foundation** and **Colosseum** for the Frontier Hackathon
- **Solana Bali Builders** — $15k Build Station + mentor support
- **Jupiter** for the swap aggregator and API
- **Solana Pay** for the QR payment spec
- The **Phantom** and **Backpack** wallet teams
