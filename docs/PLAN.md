# OnPay — Implementation Plan

**Timeline:** 2026-04-10 → 2026-05-11 (≈32 days)
**Hard deadlines:**
- Individual Colosseum registration: **2026-05-04**
- Project submission: **2026-05-11**

> This plan is the working roadmap. Update milestone checkboxes as work progresses. When a decision changes the plan, also update `MEMORY.md` > Decisions log.

---

## 0. Working principles

1. **Ship the MVP before optimizing.** A working devnet flow beats a perfect architecture.
2. **Non-custodial first.** Any design that puts OnPay between buyer and funds gets rejected.
3. **English-only for all shipped artifacts.** PRD, README, demo, code comments, commit messages.
4. **Open-source hygiene from day one.** Permissive license (MIT or Apache 2.0), clean commits, conventional commit messages, meaningful PRs even if solo.
5. **Judging-criteria-aware.** Every feature decision asks: which of the 6 criteria does this advance?
6. **Fail-fast on unknowns.** Spike risky pieces (Jupiter swap + transfer composition, tx size) in week 1, not week 4.

---

## 1. Milestones at a glance

| Week | Dates | Milestone | Exit criteria |
|---|---|---|---|
| **W1** | Apr 10 – Apr 17 | Foundation + critical spike | Monorepo scaffolded; Solana Pay Transaction Request endpoint returns a valid unsigned tx on devnet; Jupiter quote working; wallet adapter connected |
| **W2** | Apr 17 – Apr 24 | Core payment flow end-to-end | Buyer can scan → pay with any SPL → merchant receives USDC on devnet, atomically |
| **W3** | Apr 24 – May 1 | Merchant dashboard + invoice management | Merchant auth, invoice CRUD, QR generation, transaction history, real-time status |
| **W4** | May 1 – May 8 | Polish, security, a11y, i18n, mainnet dry-run | Lighthouse 95+, security review, devnet → mainnet-beta smoke test, bug bash |
| **W5** | May 8 – May 11 | Submission package | Demo video, final README, landing page, Colosseum form filled, repo tagged v1.0 |

**Registration lockdown:** Individual registration must be done by **Sunday, May 3** at the latest (one day buffer before the May 4 deadline). Put this on the calendar NOW.

---

## 2. Week 1 — Foundation + critical spike (Apr 10–17)

### Goal
Prove the two hardest technical unknowns work **before** touching UI:
1. Can we compose a Jupiter swap + USDC transfer into one atomic transaction within Solana's tx size limit?
2. Does Solana Pay Transaction Request correctly hand the tx to a mobile wallet?

### Tasks

#### Repo + tooling
- [ ] Add `.gitignore`, LICENSE (MIT), commitlint, prettier, eslint, husky pre-commit
- [ ] Decide monorepo structure: single Next.js app for MVP; extract SDK later
- [ ] Scaffold Next.js 15 app (`apps/web`) with App Router, TS strict, Tailwind, shadcn/ui
- [ ] Set up Supabase project (free tier), create `merchants`, `invoices`, `payments` tables with RLS
- [ ] Add `.env.example` with all required keys; document in README

#### Solana plumbing
- [ ] Install `@solana/web3.js`, `@solana/spl-token`, `@solana/pay`, `@solana/wallet-adapter-*`
- [ ] Wire up wallet adapter provider (Phantom, Backpack, Solflare)
- [ ] Devnet RPC (Helius or default); add mainnet config gated by env

#### Critical spike: Jupiter + transfer composition
- [ ] Hardcoded test: use a dev wallet to quote SOL → USDC via Jupiter v6 API
- [ ] Fetch swap instructions (not swap tx) from `/swap-instructions` endpoint
- [ ] Compose: `[ComputeBudget, ...Jupiter setup, Jupiter swap, USDC transfer to merchant, ...Jupiter cleanup]`
- [ ] Confirm tx fits in 1232 bytes — if not, implement Address Lookup Tables (ALTs)
- [ ] Sign with dev wallet, broadcast to devnet, verify merchant received USDC
- [ ] **Kill criterion:** if this spike fails by end of week 1, escalate — may need to simplify (e.g., swap-then-transfer in two txs, less elegant but still works)

#### Solana Pay Transaction Request
- [ ] Implement `GET /api/tx/[reference]` endpoint (returns `{label, icon}`)
- [ ] Implement `POST /api/tx/[reference]` endpoint (accepts `{account}`, returns base64 tx)
- [ ] Generate a test QR pointing at this endpoint
- [ ] Test with Phantom mobile on a real phone scanning from laptop

### Exit criteria
- Mobile Phantom scans QR → approves → merchant devnet wallet receives USDC ✓
- Repo has CI that runs `typecheck + lint + test` on every push ✓
- Supabase schema exists and is reachable from the app ✓

---

## 3. Week 2 — Core payment flow (Apr 17–24)

### Goal
The full buyer payment flow, end-to-end, working on devnet with proper error handling. Merchant UI still rough — just enough to create invoices and see confirmations.

### Tasks

#### Backend
- [ ] `POST /api/invoices` — create invoice (authenticated via wallet signature)
- [ ] `GET /api/invoices/:id` — fetch invoice
- [ ] `GET /api/tx/:reference` + `POST /api/tx/:reference` — full Transaction Request implementation
  - Load invoice by reference
  - Look up merchant's USDC ATA (create if needed, inside the tx)
  - Call Jupiter quote for buyer's input token
  - Build atomic swap + transfer
  - Return versioned transaction
- [ ] Rate limiting on tx endpoint (Vercel KV or Upstash)
- [ ] Slippage cap env var, default 1%
- [ ] Reference key generation: 32 bytes crypto-random
- [ ] Idempotency: same reference = same invoice, no duplicate writes

#### Frontend (thin)
- [ ] "New payment" page: amount input, label, memo, "Generate QR" button
- [ ] QR display page (fullscreen friendly)
- [ ] Confirmation page: polls for payment status
- [ ] Buyer-side success page (shown after wallet redirects back)

#### Edge cases
- [ ] Buyer token has no Jupiter route → show clear error
- [ ] Slippage exceeded → show clear error
- [ ] Invoice expired (add TTL, e.g., 10 min) → return 410 Gone
- [ ] Invoice already paid → return 409 Conflict
- [ ] Insufficient buyer balance → let the wallet surface this (it will)

### Exit criteria
- [ ] End-to-end flow: create invoice → display QR → scan with phone → pay with SOL → merchant wallet shows USDC ✓
- [ ] Same works with a non-SOL input (e.g., BONK) ✓
- [ ] Error states handled gracefully ✓
- [ ] All payments logged in Supabase with tx hash ✓

---

## 4. Week 3 — Merchant dashboard + polish (Apr 24 – May 1)

### Goal
Merchant onboarding + dashboard that actually feels like a product. Real-time updates. Good empty states. No placeholder copy anywhere.

### Tasks

#### Merchant onboarding
- [ ] Landing page (marketing): hero, "how it works", social proof placeholder, CTA
- [ ] Connect wallet → auto-create merchant record if new
- [ ] Onboarding wizard: business name, preferred stable (default USDC), settlement wallet = connected wallet
- [ ] Save to Supabase; scoped by wallet public key (RLS policy)

#### Dashboard
- [ ] Overview cards: today, week, month totals + tx counts
- [ ] Invoice list table: status, amount, buyer (truncated), time, tx link
- [ ] "New payment" CTA prominently placed
- [ ] Empty state for zero transactions (guides user to create first invoice)
- [ ] Invoice detail drawer: full metadata, on-chain link, refund info (placeholder for now)

#### Real-time
- [ ] WebSocket or Supabase Realtime subscription on `payments` table
- [ ] Toast notification when a payment completes
- [ ] Dashboard cards auto-update without refresh

#### Transaction history
- [ ] Paginated list (20 per page)
- [ ] Filter by status (all / paid / pending / expired)
- [ ] Export CSV (nice-to-have if time permits)

### Exit criteria
- [ ] New merchant can go from landing page → connected wallet → first invoice created in <60 seconds
- [ ] Dashboard feels real: no lorem ipsum, consistent typography, working empty states
- [ ] Real-time payment notifications work

---

## 5. Week 4 — Polish, security, a11y, mainnet dry-run (May 1–8)

### Goal
Ship-quality. Something you'd be proud to put in front of judges.

### Tasks

#### Security review
- [ ] Read every API route line-by-line. No unvalidated input. No secrets in client bundles.
- [ ] Verify CSP headers set in `next.config.ts`
- [ ] Verify Supabase RLS policies prevent cross-merchant data leaks (write a negative test)
- [ ] Audit `.env` for accidentally committed secrets (`git log -p -- .env*`)
- [ ] Pin all dependency versions; run `npm audit`
- [ ] Enable Dependabot

#### Accessibility
- [ ] Keyboard navigation across all flows
- [ ] Screen reader pass on dashboard + payment flow
- [ ] Color contrast audit (WCAG AA)
- [ ] Lighthouse: target ≥95 accessibility, ≥90 performance

#### i18n
- [ ] Extract strings to `messages/en.json` + `messages/id.json`
- [ ] Language switcher in header
- [ ] Verify all user-facing text is translatable (no hardcoded strings)

#### Code quality
- [ ] JSDoc on every exported function
- [ ] Zero `any` types (use `unknown` + narrowing)
- [ ] Unit tests for transaction composition logic
- [ ] Integration test for full payment flow (devnet)
- [ ] Commit history cleanup: rebase or squash where messy

#### Mainnet dry-run
- [ ] Deploy to Vercel production with mainnet env vars
- [ ] Do ONE real mainnet payment end-to-end (small amount, Wira's own wallets)
- [ ] Verify logs, Supabase records, dashboard updates
- [ ] **Do NOT leave mainnet open to the public yet** — gate by feature flag

#### Bug bash
- [ ] Test every wallet (Phantom mobile, Backpack mobile, Solflare, desktop browser extensions)
- [ ] Test on slow 3G (Chrome DevTools throttle)
- [ ] Test with low-balance wallet (should error gracefully)
- [ ] Test with no-route token
- [ ] Test invoice expiration

### Exit criteria
- [ ] Lighthouse 95+ accessibility, 90+ perf on production
- [ ] Mainnet payment confirmed on-chain
- [ ] Security review checklist 100% complete
- [ ] Bug bash report: all P0/P1 fixed

---

## 6. Week 5 — Submission package (May 8–11)

### Goal
Make the judges' job easy. A polished repo + a compelling 3-minute demo.

### Tasks

#### Demo video (≤3 minutes)
- [ ] Script:
  1. Hook: "Every merchant loses 2–3% to card processors. OnPay makes that 0." (10s)
  2. Problem: Bali café clip, buyer wants to pay in SOL, merchant can't. (20s)
  3. Demo: merchant creates invoice → buyer scans on phone → picks BONK → signs → merchant dashboard shows USDC received. (90s)
  4. Architecture: one slide showing Solana Pay + Jupiter + atomic tx. (20s)
  5. Business: TAM, fee model, Bali beachhead, Phase 2 SDK. (30s)
  6. Close: repo link, demo link, thank you. (10s)
- [ ] Record on the final deployed build
- [ ] Edit in a simple tool (DaVinci Resolve or Descript)
- [ ] Upload to YouTube (unlisted or public)

#### README
- [ ] Hero: logo, tagline, one-line description, live demo link, video link
- [ ] Problem/solution (3 paragraphs max)
- [ ] Architecture diagram (use the one in PRD)
- [ ] "Run locally" setup guide (15-minute rule: if a judge can't run it in 15 minutes, it's broken)
- [ ] Tech stack table with versions
- [ ] Disclosed AI tools used (Claude Code, v0, etc.)
- [ ] Open-source license
- [ ] Acknowledgements (Solana Bali Builders, Jupiter, Solana Pay)

#### Landing page / project website
- [ ] Clean one-pager with: logo, tagline, "how it works", video embed, repo link, "Try the demo" CTA
- [ ] Deploy on same Vercel project or a subdomain

#### Colosseum form
- [ ] Fill out the registration form (see `HACKATHON_SUBMISSION.md`)
- [ ] Submit individual registration **by May 3** (one day buffer)
- [ ] Submit final project **by May 10** (one day buffer before May 11 deadline)

#### Repo finalization
- [ ] Tag `v1.0.0`
- [ ] GitHub Release with release notes
- [ ] Final commit with clean message
- [ ] Archive branch protection (no force-push after submission)

### Exit criteria
- [ ] Demo video live
- [ ] README is self-contained and can be followed by a stranger
- [ ] Landing page is up
- [ ] Colosseum submission confirmed
- [ ] Repo tagged v1.0.0

---

## 7. Daily rhythm (solo builder discipline)

- **Morning (1h):** Re-read `MEMORY.md` > Decisions log. Plan the day in this file's milestone checklist. Pick 2–3 tasks.
- **Deep work block (3–4h):** Code. No Slack, no Twitter, no Discord.
- **Afternoon (2h):** Review + test + commit. Open a PR even if solo (forces self-review).
- **End of day (15m):** Update this plan's checkboxes. If anything important was decided, update `MEMORY.md`.
- **Weekly on Sundays:** 30-minute retrospective. What shipped? What slipped? Adjust the next week's plan.

---

## 8. Buffer & contingency

- **Buffer time:** May 9–10 is dedicated buffer. No scheduled work.
- **Scope cuts (in order of first-to-cut):** i18n (Bahasa) → CSV export → analytics cards → transaction filters → real-time updates (fall back to polling)
- **Cannot cut:** end-to-end payment flow, merchant dashboard, demo video, README, security review, Colosseum form submission
- **If spike fails in week 1:** degrade to "swap first, then transfer in second user action" — worse UX but still demonstrable

---

## 9. Success definition

OnPay wins the hackathon if we ship:
1. A working mainnet payment with a non-custodial atomic swap + transfer
2. A polished merchant dashboard with real-time updates
3. Open-source code that a Solana dev would be proud to read
4. A demo video that makes a judge say "I'd use this"
5. A business story that makes a judge say "this is a company, not just a hack"

If any one of these is missing, we're in the "standout teams" tier at best, not the Grand Champion tier.
