# Colosseum / Solana Frontier Hackathon — Form Answers

> Copy-paste into the Colosseum submission form at colosseum.com.
> All answers in English (required by hackathon rules).
> Character limits noted next to each field. **Bold = recommended final answer.**
> PUBLIC fields display in the hackathon directory; all others are only seen by judges & Colosseum team.

---

# PART 1 — PUBLIC PROJECT FIELDS

## PROJECT NAME — PUBLIC

```
OnPay
```

---

## BRIEF DESCRIPTION (500 char max) — PUBLIC

> Already filled on the form (448/500). Keep as-is.

```
OnPay is a decentralized payment gateway built on Solana designed for seamless real-world adoption. It features an automated 'Any-to-Stable' swap mechanism, allowing customers to pay with various SPL tokens while merchants receive instant settlement in USDC. By leveraging Solana's speed and low fees, OnPay eliminates high gateway costs and brings a Web2-like checkout experience to Web3 commerce, specifically targeting SMEs and local businesses.
```

---

## PROJECT WEBSITE — PUBLIC

> Placeholder until the Vercel landing page is live. Swap to the real domain (e.g., `https://onpay.id` or `https://onpay-solana.vercel.app`) before final submission.

```
https://github.com/me-workspace/onpay_solana
```

---

## WHAT ARE YOU BUILDING, AND WHO IS IT FOR? (1000 char max) — PUBLIC

**FINAL (≈985 chars):**

```
OnPay is a non-custodial payment gateway on Solana that lets merchants accept ANY SPL token while receiving instant USDC settlement. Buyers scan a Solana Pay QR, pick whichever token they already hold (SOL, BONK, JUP, USDT, etc.), and sign once — the merchant's wallet receives USDC in under two seconds, atomically. OnPay's servers never touch funds.

It's built for SMEs and local businesses — starting with cafés, retailers, and tour operators in Bali — who are priced out of crypto acceptance by 2-3% card fees and a Web3 UX that assumes buyers and sellers hold the same token. OnPay turns "accept crypto" into a printed QR sticker and "pay with crypto" into a one-tap action.

Secondary audience: global e-commerce SMBs wanting to add crypto checkout without holding volatile assets or paying a custodial processor. Phase 2 ships a TypeScript SDK and Shopify/WooCommerce/Wix plugins so any developer can embed OnPay in minutes.
```

---

## WHY DID YOU DECIDE TO BUILD THIS, AND WHY BUILD IT NOW? (1000 char max) — PUBLIC

**FINAL (≈970 chars) — first-person Bali story, more memorable than macro claims:**

```
Two things converged. First: I live in Bali. Every week I watch a café owner turn away a European tourist who wants to pay in SOL, and I watch the same café owner hand 2.5% of her revenue to a card processor that settles in three days. The gap between "crypto is real money now" and "I can actually spend it in person" is painfully obvious when you see it face-to-face.

Second: the tools to close that gap finally exist. Solana's sub-cent fees make $0.50 payments economically viable. Sub-2-second finality works for in-person retail. Jupiter's liquidity depth now enables true any-to-stable routing across 50+ tokens. Solana Pay is a universal QR spec every major wallet supports. These pieces didn't line up 18 months ago — they do today.

The winning design for merchant payments is non-custodial, token-agnostic, and one-tap. Nobody has shipped that reference implementation yet. I'm building OnPay to be it, and Bali is the beachhead to prove it works.
```

---

## WHAT TECHNOLOGIES ARE YOU USING OR INTEGRATING WITH?

> Keep scannable. Groups by Solana / app layer / tooling / AI.

```
Solana ecosystem:
- Solana (devnet + mainnet-beta)
- Solana Pay (Transaction Request spec for dynamic QR payments)
- Jupiter v6 Swap API (aggregated any-to-stable routing)
- SPL Token program (USDC settlement)
- @solana/web3.js, @solana/spl-token, @solana/pay
- @solana/wallet-adapter (Phantom, Backpack, Solflare)
- Anchor (Rust) — optional custom program for receipt events and fee collection
- Helius RPC for production traffic

Application layer:
- Next.js 15 (App Router) + TypeScript (strict) + React 19
- Tailwind CSS + shadcn/ui design system
- Supabase (Postgres + Row-Level Security) for merchant and invoice storage
- Vercel for hosting (frontend + serverless API routes)
- qrcode.react for QR rendering

Developer tooling:
- GitHub + GitHub Actions (CI: typecheck, lint, test)
- ESLint + Prettier + Husky + Commitlint + Dependabot
- Vitest (unit) + Playwright (end-to-end)

AI / pair-programming tools (disclosed):
- Claude Code (Anthropic) — primary coding assistant
- v0.dev — UI component drafting
- Colosseum Copilot — hackathon research and guidance
```

---

## WHAT CATEGORY BEST DESCRIBES YOUR PRODUCT? — PUBLIC

> Already selected.

```
Payments & Remittance
```

---

## IS YOUR PROJECT A MOBILE-FOCUSED dAPP?

**Answer: ☐ No (unchecked)**

> Reason: OnPay's primary product is a web-based merchant dashboard with Next.js API routes that implement Solana Pay Transaction Request. The buyer experience uses mobile wallets (Phantom/Backpack) to scan a QR, but OnPay itself is not a mobile dApp — it's a payment gateway consumed from mobile wallets. Same reason Stripe isn't considered a mobile app even though most payments come from phones.

---

# PART 2 — REPO, DEMO & PRODUCT LINKS

## PLEASE SHARE ANY IMPORTANT CONTEXT ABOUT YOUR REPO (500 char max)

```
The repo contains the complete OnPay product: Next.js frontend + API routes, Solana Pay Transaction Request backend, Jupiter swap composition, merchant dashboard, and an optional Anchor receipt program. Everything needed to reproduce the demo is in this single repository — no hidden submodules or unrelated code. The `/docs` folder contains the PRD, implementation plan, and decisions log. README has a 15-minute local setup guide.
```

---

## DEMO VIDEO (required, ≤3 min, YouTube/Loom/Vimeo, must show live product not slides)

> **Fill in after recording (target: May 9).** Placeholder:

```
https://youtube.com/watch?v=TBD
```

**Script outline (from PLAN.md):**
1. Hook: "Every merchant loses 2-3% to card processors. OnPay makes that 0." (10s)
2. Problem: Bali café clip, buyer wants to pay in SOL, merchant can't. (20s)
3. Live demo: merchant creates invoice → buyer scans on phone → picks BONK → signs → merchant dashboard shows USDC received. (90s)
4. Architecture: one slide showing Solana Pay + Jupiter + atomic tx. (20s)
5. Business: TAM, fee model, Bali beachhead, Phase 2 SDK. (30s)
6. Close: repo link, demo link, thank you. (10s)

**Checkbox: ☑ Make demo video public in the project directory**

---

## LIVE PRODUCT LINK

> Fill in after Vercel deploy. Placeholder:

```
https://onpay-solana.vercel.app
```

---

## ACCESS INSTRUCTIONS

```
No login required. To test as a merchant: visit the live link and click "Connect Wallet" — any Solana wallet (Phantom/Backpack/Solflare) will create a merchant account automatically, scoped to that wallet. Create an invoice and you'll see a QR code.

To pay an invoice: scan the QR with a Solana Pay-compatible mobile wallet (Phantom or Backpack) funded with devnet tokens. Toggle between devnet/mainnet in the header. For judges: use devnet and airdrop test SOL via https://faucet.solana.com, or DM the Telegram contact below for a pre-funded test wallet.
```

---

## PITCH VIDEO (required, ≤2 min, YouTube/Loom only) — PUBLIC

> Separate from demo. Introduce yourself, what you're building, and why you're the person to build it. **Fill after recording (target: May 9).**

```
https://youtube.com/watch?v=TBD
```

**Script outline (≤2 min):**
1. Who I am (15s): name, background, where I'm based (Bali), why I'm building on Solana
2. What OnPay is in one sentence (15s): non-custodial any-to-stable payment gateway
3. Why me (30s): live in Bali, first-hand exposure to both sides of the pain point, already in the Solana Bali Builders network with mentor support secured
4. Why now (30s): Solana's fundamentals finally viable + mainstream stablecoin momentum (Visa/Stripe/PayPal USDC rails)
5. Close (30s): asking the accelerator for capital + network to go door-to-door in Bali and prove the unit economics

---

# PART 3 — TEAM FIELDS

## DID ANYONE NOT LISTED ON THE TEAM HERE DO MEANINGFUL WORK ON THIS PROJECT? IF SO, PLEASE EXPLAIN. (600 char max)

```
No — OnPay is a solo build. All product decisions, architecture, and code were authored by me. Claude Code (Anthropic) and v0.dev were used as AI pair-programming tools and are disclosed per hackathon guidelines. Informal feedback and merchant pain-point validation came from conversations with the Solana Bali Builders community and ~15 local café/warung owners in Canggu and Ubud, but none of them contributed code, designs, or decisions to the submission.
```

---

## TEAM TELEGRAM CONTACT — required

> Already filled:

```
082247662313
```

> **Reminder:** Colosseum expects a Telegram **handle** (e.g., `@username`) for prize distribution and interviews. If `082247662313` is a WhatsApp/phone number, create a Telegram account tied to that number and update to the `@username` form before submitting. A phone number alone may cause issues.

---

## X PROFILE — PUBLIC

> Not filled. Add your X/Twitter handle here, or leave blank if you don't want a public X link.

```
@your_x_handle
```

---

## IS THERE ANYTHING ELSE JUDGES SHOULD KNOW ABOUT YOUR PROJECT THAT ISN'T CAPTURED ABOVE? (500 char max)

```
OnPay is being built from Bali, where the merchant pain point is immediate and personal, not theoretical. I've secured a Solana Bali Builders $15k Build Station and mentor support pass, and I'm plugged into the Solana Foundation's local builder network. The path to first 100 merchants post-hackathon is a physical, door-to-door rollout in Canggu, Ubud, and Seminyak — not a Twitter launch. The non-custodial architecture is non-negotiable: it's both the product edge and the regulatory moat in Indonesia.
```

---

# PART 4 — ACCELERATOR APPLICATION (PRIVATE to Colosseum & organizers)

## HOW DO YOU KNOW PEOPLE ACTUALLY NEED, OR WILL NEED, THIS PRODUCT? (1000 char max)

```
Three sources of evidence:

1. Direct observation. I live in Bali and personally witness merchants turning away crypto-holding tourists multiple times per week — cafés, warungs, tour operators. "Can I pay with crypto?" is asked far more often than it is answered.

2. Merchant economics. Local UMKMs pay 2-3% to card processors (BCA, Mandiri) plus fixed IDR fees, with 2-3 day settlement. On a $2 coffee at 30% gross margin, that fee represents ~10% of the profit. In ~15 informal conversations with café and warung owners in Canggu and Ubud, every single one said they'd try a faster/cheaper option immediately if the onboarding was simple.

3. Macro validation. Stablecoin payment volume surpassed Visa's in 2024. Visa, Stripe, and PayPal all shipped USDC rails in the last 12 months. The signal from incumbents is unambiguous: stablecoin payments are crossing the mainstream threshold.

The open question is which UX wins. OnPay's bet: non-custodial, token-agnostic, QR-native.
```

---

## HOW FAR ALONG ARE YOU? DO YOU HAVE USERS? PLEASE BE AS SPECIFIC AS POSSIBLE. (1000 char max)

```
Honest answer: pre-MVP as of 2026-04-10. OnPay is a hackathon-fresh build targeting full working MVP by May 11.

What exists today:
- Public GitHub repo (github.com/me-workspace/onpay_solana) with README, license, CI skeleton
- Detailed English PRD, 5-week implementation plan, decisions log (in /docs)
- Architecture validated on paper: Solana Pay Transaction Request + Jupiter v6 swap-instructions + atomic SPL transfer composed into one signed tx
- Solana Bali Builders $15k Build Station + mentor support pass already secured
- Informal merchant validation from ~15 conversations in Canggu and Ubud

What does NOT exist yet: deployed code, paying users, on-chain volume. Zero users today — users come post-hackathon.

Weekly milestones are explicit: W1 Jupiter composition spike, W2 end-to-end devnet flow, W3 merchant dashboard, W4 polish + mainnet dry-run, W5 submission. First real mainnet transaction targeted ~May 1. The 100-merchant target for the first 6 months assumes physical door-to-door onboarding.
```

---

## WHO ELSE IS BUILDING IN THIS SPACE, AND WHAT DO YOU THINK THEY'RE GETTING WRONG? (1000 char max)

```
The payments-on-Solana space splits into three camps:

1. Custodial processors (Helio/MoonPay, Stripe Crypto, Coinbase Commerce). They solve merchant settlement by holding funds — which reintroduces the exact middleman fees, counterparty risk, and settlement delay that crypto should eliminate. Getting wrong: custody.

2. Token-specific payment links (Solana Pay reference implementations, Sphere Labs). They work beautifully when buyer and seller hold the same token, but buyers in the real world hold fragmented portfolios (SOL, BONK, JUP, USDC) and merchants want stable. Getting wrong: forcing token alignment, which kills conversion.

3. NFT/digital-goods checkout (Crossmint, Phantom's in-app buying). Built for one-shot NFT drops, not for a $3 latte or a $40 dinner tab. Getting wrong: the use case.

None of them compose Solana Pay + Jupiter + SPL into ONE atomic any-to-stable transaction for merchants. That's the gap OnPay fills. Non-custodial, token-agnostic, QR-native. One signature, two seconds, USDC in your wallet.
```

---

## HOW DO YOU MAKE MONEY, OR HOW DO YOU PLAN TO? (500 char max)

```
Hackathon MVP: 0% protocol fee to prove the flow. Production: 0.2-0.5% fee routed inside the same atomic transaction to a treasury PDA — still non-custodial, still 4-5x cheaper than card processors. Secondary revenue: Phase 2 fiat off-ramp takes a spread on USDC→IDR conversions (~0.5%). Tertiary: premium SDK/plugin tier for e-commerce integrations (Shopify, WooCommerce) with a flat monthly fee for high-volume merchants. Free tier for merchants under $1k/month.
```

---

## HOW LONG HAVE YOU EACH BEEN WORKING ON THIS? HAVE YOU BEEN WORKING ON IT FULL TIME? (500 char max)

```
Solo founder. Actively building OnPay since April 6, 2026 (Solana Frontier Hackathon kickoff). Part-time for week 1 alongside other commitments; moving to full-time for weeks 2-5. Broader research into Solana payments and merchant conversations began in March 2026. Post-hackathon commitment is full-time if either (a) the Colosseum accelerator accepts the project, or (b) initial merchant traction validates the direction in May/June.
```

---

## WHERE IS EACH MEMBER OF THE TEAM CURRENTLY BASED, AND DO YOU WORK IN-PERSON TOGETHER? (500 char max)

```
Solo founder based in Bali, Indonesia (Canggu area). This is intentional, not incidental — Bali is both home and the go-to-market beachhead for OnPay's first 100 merchants. Working from co-working spaces with occasional in-person sessions with the Solana Bali Builders community. No plans to relocate: staying in Bali maximizes the merchant-onboarding advantage. Happy to travel for accelerator programming or investor meetings if accepted.
```

---

## HAVE YOU FORMED A LEGAL ENTITY YET?

**Answer: ○ No**

> *(Confirm with Wira — default assumption for a solo, pre-revenue hackathon build.)*

---

## HAVE YOU TAKEN ANY INVESTMENT YET?

**Answer: ○ No**

---

## ARE YOU CURRENTLY FUNDRAISING?

**Answer: ○ No**

> *(Flipping this to "Yes" signals stronger intent but also invites more scrutiny. For a pre-MVP solo project, "No" is more credible. Revisit post-hackathon.)*

---

## DO YOU HAVE A LIVE TOKEN?

**Answer: ○ No**

> OnPay has no token and no plans to launch one. The product settles in USDC. This is a strength for the judging criteria (novelty + non-custodial narrative) — lean into it.

---

# SUBMISSION CHECKLIST (work backward from May 11)

- [ ] **By May 3:** Individual registration submitted on colosseum.com (one-day buffer before the hard May 4 cutoff)
- [ ] **By May 3:** Team Telegram confirmed as `@handle` (not phone number)
- [ ] **By May 8:** All form answers finalized in this file
- [ ] **By May 9:** Demo video recorded + uploaded to YouTube (public, unlisted OK for safety)
- [ ] **By May 9:** Pitch video recorded + uploaded to YouTube
- [ ] **By May 10:** README finalized, landing page live on Vercel, repo tagged v1.0
- [ ] **By May 10:** Full submission uploaded (one-day buffer before May 11 cutoff)
- [ ] **May 11:** Triple-check submission, monitor for Colosseum emails

## Post-submission
- [ ] Save submission confirmation email
- [ ] Archive a snapshot of submitted version (git tag + source ZIP)
- [ ] Track `colosseum.com/frontier` for winner announcements on 2026-06-23

---

# ITEMS NEEDING YOUR INPUT BEFORE SUBMIT

1. **Project website URL** — swap from GitHub to real domain once Vercel is deployed
2. **Telegram handle** — confirm `@username` (not phone number)
3. **X profile** — add your handle or leave blank
4. **Demo video URL** — record and upload (target May 9)
5. **Pitch video URL** — record and upload (target May 9)
6. **Live product link** — Vercel URL after deploy
7. **Legal entity / investment / fundraising / token** — confirm all four "No" answers match reality
