# OnPay — Project Memory

> This is the canonical project memory file. Read this first when resuming work on OnPay. Keep it updated as decisions change. Supersedes any conflicting information elsewhere.

**Last updated:** 2026-04-11

---

## 1. Identity

- **Project name:** OnPay
- **Tagline:** "Flexible Input, Stable Output." — Pay in any SPL token, merchants receive USDC.
- **Category:** Payments & Remittance
- **Chain:** Solana (devnet → mainnet-beta)
- **Repo:** https://github.com/me-workspace/onpay_solana
- **Local working dir:** `C:\Users\wira0\OneDrive\Documents\Project\Holixora\Solana Project\onpay_solana`
- **Parent project folder:** `C:\Users\wira0\OneDrive\Documents\Project\Holixora\Solana Project` (contains original Bahasa PRD draft, logo, hackathon pass)
- **Owner/builder:** Wira (solo, as of this writing — team status may change)
- **Hackathon:** Solana Frontier Hackathon (Colosseum)

---

## 2. Core value proposition

OnPay is a **non-custodial, token-agnostic payment gateway** on Solana that bridges Web3 liquidity with real-world commerce.

- **Buyer side:** Pay with any SPL token you already hold (SOL, BONK, JUP, USDT, etc.) by scanning a QR. One signature, done in <2s.
- **Merchant side:** Receive guaranteed **USDC** (or any stable the merchant chooses) with no volatility exposure, no custodial holding period, and sub-0.5% fees.
- **OnPay never touches funds.** Value flows: buyer → Jupiter swap → merchant wallet, atomically in one transaction.

This is the key differentiator from Stripe/Visa (high fees, fiat-only) and from naive Solana Pay (same-token-only, merchant must manage volatility).

---

## 3. Target users

**Primary (hackathon pitch):** SMEs / UMKMs in Bali and Southeast Asia — cafés, retailers, homestays, tour operators, warungs.

**Why Bali first?**
- Dense population of crypto-native tourists who want to spend SOL/stablecoins
- Local merchants losing 2–3% to card processors, plus IDR settlement delays
- Wira is physically based there — can iterate with real merchants
- Solana Bali Builders ecosystem ($15k Build Station mentor pass already secured)

**Secondary:** Global e-commerce SMBs that want to accept crypto without holding it.

---

## 4. Architecture (target state)

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
│  - Jupiter v6 quote + swap instruction      │
│  - Builds atomic tx: swap → transfer        │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  Solana (on-chain)                          │
│  - Jupiter program (swap)                   │
│  - SPL Token program (USDC transfer)        │
│  - OnPay Anchor program (optional:          │
│    invoice receipt + fee collection PDA)    │
└─────────────────────────────────────────────┘
```

**Key architectural decisions:**

1. **Solana Pay Transaction Request (not Transfer Request).** We must dynamically build the transaction based on the buyer's chosen input token, so we need a backend endpoint that the wallet calls after scanning.

2. **Jupiter v6 for routing.** Use Jupiter's `/quote` and `/swap-instructions` endpoints to get the instructions, then compose them with a final USDC transfer to the merchant in a single transaction. This keeps it atomic: either the buyer gets charged AND the merchant gets paid, or nothing happens.

3. **Non-custodial is load-bearing.** No PDA holds buyer funds between swap and transfer. Everything is one transaction, signed once.

4. **Anchor program scope (TBD):** Minimal for MVP. Candidates:
   - Emit a `PaymentReceipt` event with invoice ID for easy indexing
   - Collect an optional protocol fee (0.1–0.3%) into a treasury PDA
   - Enforce that the final USDC transfer goes to the merchant-declared wallet
   - *Decision:* Start without a custom program (pure composition of Jupiter + SPL transfer). Only add Anchor if it meaningfully improves security, indexing, or the judges' "Solana composability" score.

5. **Merchant auth:** Wallet-based. Merchants connect Phantom/Backpack; their wallet address IS their merchant ID. No passwords, no KYC for MVP.

6. **Invoice storage:** PostgreSQL (Drizzle) Postgres for MVP (invoice metadata, status, amounts). On-chain receipts via transaction logs / program events.

---

## 5. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Smart contract | Anchor (Rust) | Standard for Solana; good DX; optional for MVP |
| Frontend | Next.js 15 + TypeScript + App Router | Fast iteration; API routes double as Solana Pay backend |
| Styling | Tailwind CSS + shadcn/ui | Fast, professional, accessible-by-default |
| Wallets | `@solana/wallet-adapter` (Phantom, Backpack, Solflare) | Industry standard |
| Solana client | `@solana/web3.js`, `@solana/spl-token` | Standard |
| Payment spec | Solana Pay (`@solana/pay`) | Official QR standard |
| Swap | Jupiter v6 API (`@jup-ag/api` or direct HTTPS) | Deepest aggregated liquidity on Solana |
| Database | PostgreSQL (Drizzle) (Postgres + RLS) | Free tier; handles invoices + merchant profiles |
| Hosting | Vercel | Zero-config Next.js deploys |
| QR generation | `qrcode.react` | Lightweight, well-maintained |
| SDK (future) | TS monorepo package | Enables e-commerce plugin strategy |
| AI assist | Claude Code, v0.dev (UI drafts) | Per judging criteria — disclose AI tool usage |

---

## 6. Scope: MVP vs post-hackathon

### MVP (must ship by 2026-05-11)
1. Merchant onboarding via wallet connect
2. Create invoice (amount in USD, reference label, memo)
3. Generate Solana Pay QR code
4. Buyer scans → picks input token → sees quote → signs → merchant receives USDC
5. Transaction status polling + confirmation screen for both sides
6. Merchant dashboard: invoice list, payment history, total received
7. Works on Solana devnet with test tokens; mainnet config ready but gated
8. Demo video (≤3 min) + English README + deploy URL

### Explicit non-goals for MVP
- Fiat off-ramp (Phase 2 — needs local banking partner)
- Subscription payments (Phase 2 — needs Anchor program)
- E-commerce plugins (Phase 2 — depends on stable SDK)
- Loyalty NFTs (Phase 2)
- Mobile app (web-first; mobile wallets scan the web-generated QR)
- Multi-currency invoicing beyond USD (IDR display is cosmetic only in MVP)

---

## 7. Hackathon constraints & deadlines

- **Contest period:** 2026-04-06 → 2026-05-11 11:59pm PT
- **Individual registration:** hard deadline **2026-05-04 11:59pm PT** (form disables)
- **Submission:** by **2026-05-11 11:59pm PT** (team leader uploads)
- **Winners announced:** 2026-06-23
- **Prize tiers:** Grand $30k / Public Goods $10k / University $10k / +20 standout teams $10k each (all CASH-SPL)
- **Language rule:** ALL submitted content must be in English. Original PRD (in parent folder) is in Bahasa — English PRD lives in this repo.
- **Judging criteria (verbatim):**
  1. Functionality + code quality
  2. Potential Impact + TAM
  3. Novelty
  4. UX leveraging Solana performance
  5. Open-source + composability with Solana primitives
  6. Business Plan viability
- **IP:** Wira retains IP; must disclose third-party/open-source code
- **Resources in hand:** Solana Bali Builders $15k Build Station + mentor support pass (in parent folder)

---

## 8. Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-10 | Repo name: `onpay_solana`, public | Judges score open-source explicitly |
| 2026-04-10 | Primary language for all docs: English | Hackathon rules require it |
| 2026-04-10 | Start without custom Anchor program | Pure Jupiter + SPL composition is simpler and already demonstrates composability; add program only if it earns clear judging points |
| 2026-04-10 | Solana Pay Transaction Request (not Transfer Request) | Required for dynamic any-token → USDC swap |
| 2026-04-10 | PostgreSQL (Drizzle) for invoice storage | Free, fast, RLS for merchant isolation |
| 2026-04-10 | Merchant auth = wallet connect only, no KYC | MVP focus; also reinforces non-custodial narrative |

*Update this table any time an architectural or product decision is made.*

---

## 9. Open questions / risks

1. **Jupiter swap slippage on low-liquidity input tokens.** Mitigation: enforce a max-slippage cap and surface it clearly to the buyer before signing.
2. **Transaction size limits.** Jupiter swap instructions + SPL transfer + compute budget may exceed Solana's 1232-byte tx limit for some routes. May need to use Address Lookup Tables (ALTs).
3. **Fee model.** Hackathon MVP can be 0% fee. But we should show in the pitch how a 0.1–0.3% fee would be collected without breaking non-custodial. Candidate: skim from the swap output inside the same tx.
4. **Merchant wallet connection on mobile.** Desktop dashboard is fine, but merchant onboarding on a phone may need mobile wallet adapter flow.
5. **Fiat display / FX:** For USD invoice amounts, what source for USD→token pricing? Jupiter quote handles this implicitly, but the merchant dashboard needs a display rate (Pyth? CoinGecko?).
6. **KYC/AML regulatory exposure in Indonesia.** Non-custodial design sidesteps most of it, but the fiat off-ramp (Phase 2) will hit this hard. Document now, solve later.

---

## 10. Reference links (internal)

- `docs/PRD.md` — full product requirements (English)
- `docs/PLAN.md` — implementation plan + timeline
- `docs/HACKATHON_SUBMISSION.md` — Colosseum form answers
- `docs/SECURITY.md` — threat model + accepted risks
- `docs/WHITEPAPER.md` / `docs/WHITEPAPER.pdf` — full combined business/technical doc
- Parent folder: original Bahasa PRD draft, OnPay logo, hackathon pass

---

## 11. Roadmap to submission (2026-04-11 → 2026-05-11)

Canonical plan for what's left. Ordered by priority. Work through top-to-bottom; do NOT reorder without a decision logged above. Each item is sized in focused half-days. Check items off as commits land on `main`.

### Current completion snapshot (2026-04-11)

- [x] Production-grade foundation (TS strict, ESLint, Prettier, CI, Husky, Dependabot)
- [x] Hexagonal architecture (domain / application / infrastructure / lib split)
- [x] PostgreSQL + Drizzle schema + initial migration
- [x] Critical spike — Jupiter v6 swap + ATA create + memo in a 1232-byte v0 VersionedTransaction (unit tested)
- [x] 5 API endpoints: `/api/health`, `POST /api/merchants`, `POST|GET /api/invoices`, `GET|POST /api/tx/[reference]`
- [x] Merchant dashboard UI (connect → register → create invoice → QR → polling)
- [x] Wallet adapter integration (Phantom/Backpack/Solflare via Wallet Standard, no legacy umbrella)
- [x] Hydration fix, stuck-state escape hatch, env split, pino logger fix
- [x] 53 unit tests, all green
- [x] Verified end-to-end locally against Docker Postgres (see `e86b3ec` commit)

### 🔴 CRITICAL — must ship before submission

1. **Payment confirmation loop** (`#1`, half day)
   - Right now invoices never transition from `pending` to `paid`. The dashboard polls forever after a real payment lands on-chain.
   - **Approach**: lazy on-chain check inside `GET /api/invoices/[id]`. Change `InvoiceReference` from nanoid to a base58 Solana pubkey (Keypair.generate).publicKey), add it as a non-signer, non-writable account to the memo instruction in the payment tx, and on each dashboard poll query `getSignaturesForAddress(ref)` — if found, update status to `paid` and insert a `Payment` row.
   - **Why this approach**: no webhook infrastructure, no public URL needed, works on localhost and VPS identically, same latency as client polling.
   - **Deliverables**: reference format change, Payment repo adapter, SolanaClient.findSignaturesForReference, confirmation check in GET route, unit tests with a fake SolanaClient.

2. **Wallet signature auth** (`#2`, half day)
   - Anyone can currently `POST /api/merchants` / `POST /api/invoices` claiming any wallet. Harmless for funds (non-custodial) but a red flag for code review.
   - **Approach**: `POST /api/auth/nonce` returns a nonce, client signs `"OnPay login <nonce>"` with the wallet, `POST /api/auth/verify` verifies the ed25519 signature via `tweetnacl` and issues a short-lived JWT cookie. A per-route guard reads the cookie and injects the authenticated wallet pubkey.
   - **Deliverables**: 2 new endpoints, middleware helper, cookie issuance, update merchant + invoice routes to read from cookie instead of trusting the request body, dashboard calls verify on wallet connect.

3. **Invoice expiration sweeper** (`#8`, 2 hours)
   - Pending invoices past `expires_at` stay `pending` forever.
   - **Approach**: lazy — on every `GET /api/invoices/[id]` for a pending invoice past `expires_at`, mark expired before returning. Scheduled — `POST /api/cron/expire-invoices` with a shared-secret guard, does one SQL UPDATE. Production hits it every minute.

4. **Jupiter mainnet-only bypass** (`#3`, 2 hours)
   - `buildPaymentTransaction` fails on devnet because Jupiter has no devnet routes for most tokens.
   - **Approach**: detect cluster in the use case. On devnet, skip the Jupiter call and build a direct SPL transfer from buyer → merchant. This is a "devnet test mode" that lets us verify the full pipeline without mainnet funds, then switch to real Jupiter for the mainnet smoke test.

5. **Mainnet-beta smoke test** (`#5`, 1 hour)
   - Put $2 of real SOL/USDC in a wallet, create a mainnet invoice, scan, pay, confirm merchant received USDC on-chain. Document the tx hash in the README with a Solscan link. This is the "proof it works" screenshot-ready evidence the judges want.

### 🟠 HIGH — judges will notice

6. **Transaction history list** (`#6`, 3 hours)
   - `GET /api/invoices?status=&limit=&offset=` returns authenticated merchant's invoices. Dashboard adds a paginated table.

7. **Marketing landing page** (`#4`, half day)
   - Replace the 50-line placeholder at `/` with hero + how-it-works + features + CTA. First impression.

8. **Rate limiting on public endpoints** (`#9`, 2 hours)
   - In-memory token bucket (later Upstash). Per-IP + per-wallet. 429 on excess. Applied to all public mutation endpoints and `/api/tx/[ref]`.

9. **Analytics cards** (`#7`, 2 hours)
   - Dashboard top row: today / week / month totals + tx counts. Makes the dashboard feel like a product not a prototype.

10. **Demo video (3 min) + pitch video (2 min)** (`#8`, full day)
    - Required by Colosseum submission. Scripts drafted in `HACKATHON_SUBMISSION.md`. Recording needs Wira + camera + real mainnet payment.

### 🟡 MEDIUM — polish if time

- Mobile-responsive pass
- Accessibility + Lighthouse ≥95
- i18n wired up (EN + ID)
- Empty states + skeletons
- Error telemetry (Sentry free tier)
- Merchant profile editing
- Refund flow
- Better invoice detail view with copy-to-clipboard

### 🟢 Phase 2 — explicit non-goals for hackathon

- Fiat off-ramp (IDR)
- Subscription payments (Anchor program)
- E-commerce plugins (Shopify / WooCommerce / Wix)
- Loyalty cNFTs
- Native mobile merchant app
- Multi-merchant split payments

### 🚢 Deployment (parallel track)

- **Hostinger VPS deploy** (already in `project_onpay_deployment.md`): Next.js standalone output, PM2, Nginx, Certbot, UFW, GitHub Actions auto-deploy
- **Why VPS not Vercel**: Wira already owns the VPS, saves ~$20/mo vs Vercel Pro, full control
- **Gotcha**: bump `DATABASE_POOL_MAX` from 5 → 20 for long-lived Node servers (currently tuned for serverless)

### Budget

Target: **done by 2026-05-10** (one-day buffer before the 2026-05-11 hard cutoff). Today is 2026-04-11. That gives ~30 days for items 1-10 above plus polish. Budget ≈ 5 days focused work for everything on the must-ship list.
