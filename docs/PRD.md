# OnPay — Product Requirements Document

**Status:** In Development (Solana Frontier Hackathon 2026)
**Category:** Payments & Remittance / DeFi
**Version:** 1.0 (English)
**Last updated:** 2026-04-10

> This is the authoritative English PRD for submission. The original Bahasa draft (`PRD Draft.txt` in the parent folder) is for reference only.

---

## 1. Executive summary

**OnPay is a decentralized, non-custodial payment gateway built on Solana that lets merchants accept any SPL token while receiving instant USDC settlement.** Buyers scan a QR, choose whichever token they already hold, and sign once — the merchant's wallet receives USDC in under two seconds, with no holding period, no custodial middleman, and fees below 0.5%.

OnPay turns "accept crypto" from an engineering project into a printed QR sticker, and "pay with crypto" from a token-management headache into a one-tap action. It is purpose-built for SMEs and local businesses — starting with cafés, retailers, and tourism operators in Bali — and composable enough to scale globally as an e-commerce primitive.

---

## 2. Problem

### For merchants (SMEs/UMKMs)
- **Card processing fees:** 2–3% per transaction, plus chargeback risk, plus multi-day settlement. Crushing for low-margin businesses.
- **Crypto is not a realistic alternative today.** Existing crypto payment options force merchants to either (a) hold volatile assets and manage exposure, or (b) integrate brittle custodial processors that reintroduce the exact middleman fees crypto was supposed to eliminate.
- **Settlement delays** strangle small-business cash flow, especially in tourism-driven economies.

### For buyers
- **Fragmented holdings.** A crypto user typically holds 3–10 different tokens. Existing payment rails require them to either hold the merchant's preferred token or manually swap first — a slow, clunky, multi-step flow.
- **No Web2-grade UX.** Existing crypto checkout demands that the user understand RPCs, slippage, chains, and token addresses. Mainstream users will not do this.

### For the Solana ecosystem
- Solana has the raw capability (sub-cent fees, sub-second finality, deep Jupiter liquidity, Solana Pay spec) to be the payment rail for the real economy — but there is no merchant-first, non-custodial product that ties it all together into a Web2-grade UX.

---

## 3. Solution

OnPay is built on a single operating principle: **"Flexible Input, Stable Output."**

A buyer can pay with whatever SPL token they already hold. A merchant always receives USDC (or their chosen stable). The swap happens inside the same atomic transaction the buyer signs, using Jupiter's aggregated liquidity. OnPay never holds funds.

### The four pillars

1. **Any-to-stable swap in one signature.** The buyer scans a Solana Pay QR, picks an input token, and signs one transaction. That transaction contains (a) the Jupiter swap instruction and (b) the USDC transfer to the merchant. Atomic — both succeed or both fail.

2. **Non-custodial by design.** No OnPay-controlled wallet, PDA, or escrow ever holds buyer or merchant funds between the swap and the transfer. If OnPay's servers disappear tomorrow, merchants and buyers still have their money.

3. **Web2-grade UX.** Merchants set up in under 60 seconds by connecting a wallet. Buyers pay by scanning a QR, picking a token, and tapping approve. No seed-phrase education, no chain switching, no token address copy-pasting.

4. **Composable with the Solana ecosystem.** OnPay is a thin orchestration layer over Solana Pay, Jupiter, and the SPL Token program — all open primitives. Any developer can fork it, embed it, or extend it. The Phase 2 SDK makes OnPay a drop-in for Shopify, WooCommerce, and Wix.

---

## 4. Goals

### Hackathon goals (by 2026-05-11)
- **Functional MVP on devnet and mainnet-beta.** Merchant can create invoices; buyer can pay with any SPL token → merchant receives USDC.
- **Web2-grade UX.** End-to-end payment flow (scan → pick → sign → done) in under 10 seconds.
- **Open-source and composable.** Public GitHub repo, permissive license, published TypeScript SDK, documented integration guide.
- **Production-quality code.** Security-reviewed, typed end-to-end, tested, accessible, internationalized (EN + ID).
- **Demo video + live deploy + clear business pitch.**

### Business goals (12–24 months)
- **Onboard 100+ merchants in Bali** as the first regional beachhead.
- **Process $1M+ in monthly volume** at launch, scaling to $10M/mo within 12 months post-hackathon.
- **Undercut card processors: <0.5% fee** while remaining sustainable.
- **Ship fiat off-ramp** so Bali merchants can receive IDR to their local bank within 24 hours.
- **Expand globally** via e-commerce plugins (Shopify, WooCommerce, Wix) and a developer SDK.

---

## 5. Target users

### Primary persona: Kadek, the Bali café owner
- Runs a small café in Canggu; serves ~80% tourists.
- Currently pays 2.5% to her local bank's card processor plus a fixed IDR fee. Settlement takes 2–3 business days.
- Gets asked "can I pay with crypto?" ~5 times a day and says no.
- Not a developer. Has Phantom installed because a friend showed her.
- **What she needs:** A printed QR sticker on her counter that Just Works, and IDR in her bank account this week — not USDC in a wallet she doesn't trust herself to manage.

### Secondary persona: Alex, the crypto-native tourist
- Holds SOL, USDC, JUP, and some BONK left over from a trade.
- Wants to actually spend it, not sell it at a Binance booth.
- Hates that every "crypto payment" app demands a specific token he doesn't have.
- **What he needs:** Scan, pick a token from what he already holds, tap approve, walk out with his coffee.

### Tertiary persona: Priya, the e-commerce developer
- Runs a small Shopify store in Singapore.
- Wants to add a crypto checkout option without a 6-week integration or a 2% cut to a gateway.
- **What she needs:** A plugin that installs in 5 minutes and a clear SDK if she wants to customize. (Phase 2.)

---

## 6. User journeys

### A. Merchant setup (first time)
1. Visit `onpay.id` → click "Start accepting payments"
2. Connect Phantom / Backpack → dashboard loads
3. Optional: set display name, business address, preferred settlement token (default: USDC)
4. Done. Merchant can now create invoices.

### B. Creating an invoice
1. On the dashboard, tap "New payment"
2. Enter amount in USD (default) or IDR (display only)
3. Optional: add a label ("Iced Latte × 2") and a memo
4. Tap "Generate QR"
5. System creates a Solana Pay Transaction Request URL with a unique reference key
6. QR code displays fullscreen for the buyer to scan

### C. Buyer payment flow
1. Open Phantom / Backpack → tap Scan → point at the QR
2. Wallet calls OnPay's Transaction Request endpoint with the buyer's public key
3. OnPay backend:
   - Reads the invoice (amount in USD)
   - Calls Jupiter `/quote` for the best route from buyer's input token → USDC
   - Builds an atomic transaction: `[Jupiter swap] → [USDC transfer to merchant]`
   - Returns the serialized transaction to the wallet
4. Wallet shows the buyer: "Pay 0.043 SOL → merchant receives 10.00 USDC. Slippage: 0.3%. Approve?"
5. Buyer taps Approve → signs → tx broadcasts
6. <2s later: merchant dashboard updates to "Paid ✓"; buyer sees confirmation

### D. Post-payment
- Merchant sees transaction in history with on-chain hash (linked to Solscan)
- Buyer gets a receipt notification from their wallet
- *(Phase 2)* Merchant taps "Cash out to IDR" → off-ramp partner sends rupiah to their bank

---

## 7. Features

### Phase 1: Hackathon MVP

| # | Feature | Description |
|---|---|---|
| 1 | **Wallet authentication** | Merchant connects Phantom / Backpack / Solflare via `@solana/wallet-adapter`. Wallet address = merchant ID. |
| 2 | **Invoice creation** | Form: amount (USD), label, memo. Generates unique reference key. |
| 3 | **Solana Pay QR** | Uses `@solana/pay` to build a Transaction Request URL; renders as scannable QR. |
| 4 | **Any-to-stable swap backend** | Next.js API route that receives the buyer's pubkey, calls Jupiter v6 `/quote` and `/swap-instructions`, composes the final transaction with a USDC transfer to the merchant. Returns a signed-ready, serialized transaction. |
| 5 | **Transaction atomicity** | Swap + transfer in one signed transaction. If either fails, the whole thing reverts. |
| 6 | **Real-time status** | Merchant dashboard polls or subscribes for the reference key; buyer sees a confirmation screen. |
| 7 | **Payment history** | List of all invoices with status (pending / paid / expired), amount, buyer wallet (truncated), and on-chain link. |
| 8 | **Analytics summary** | Simple cards: total received today, this week, this month; number of transactions; average ticket size. |
| 9 | **Devnet + mainnet toggle** | Environment switch for safe testing and judged demos. |
| 10 | **Accessibility + i18n** | Keyboard-navigable, screen-reader friendly, English + Bahasa Indonesia. |

### Phase 2: Post-hackathon

| # | Feature | Description |
|---|---|---|
| 1 | **Fiat off-ramp (IDR)** | Partner with a local PSP to convert merchant USDC to IDR bank deposits within 24h. |
| 2 | **Subscription payments** | Anchor program for recurring payments with permissioned debit. |
| 3 | **E-commerce plugins** | Shopify, WooCommerce, Wix plugins powered by the OnPay SDK. |
| 4 | **TypeScript SDK (`@onpay/sdk`)** | First-class npm package for custom integrations. |
| 5 | **Loyalty NFTs** | Automatic cNFT mint after Nth payment for merchant-branded loyalty programs. |
| 6 | **Multi-merchant routing** | Marketplace-style split payments (e.g., 90% to vendor, 10% to platform). |
| 7 | **Mobile merchant app** | Native iOS/Android app for cashier-style invoice creation. |

---

## 8. Technical architecture

### 8.1 Transaction flow

```
Buyer Wallet                OnPay Backend              Solana
─────────────               ─────────────             ─────────
   Scan QR
      │
      ▼
 GET /tx/[ref]  ──────────►  Load invoice
                             Jupiter quote (token→USDC)
                             Jupiter swap instructions
                             Append USDC transfer to merchant
                             Serialize unsigned tx
      ◄──────────────────── Return tx
 Show preview
 Sign
      │
      ▼
 sendTransaction ────────────────────────────────────►  Execute atomically
                                                        1. Jupiter swap
                                                        2. SPL transfer → merchant
      ◄──────────────────────────────────────────────  Confirmed (<2s)

Merchant Dashboard  ◄── WebSocket / polling ◄───── Reference key found on-chain
```

### 8.2 Stack

- **Smart contract layer:** Anchor (Rust). Optional for MVP — pure Jupiter + SPL composition works. Added only if a custom program meaningfully improves security, event emission, or Solana-composability scoring.
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Next.js API routes (serverless functions on Vercel)
- **Database:** PostgreSQL (Drizzle ORM) (Postgres + Row Level Security for merchant isolation)
- **Solana clients:** `@solana/web3.js`, `@solana/spl-token`, `@solana/pay`, `@solana/wallet-adapter`
- **Swap:** Jupiter v6 API (`@jup-ag/api` or direct HTTPS)
- **Hosting:** Vercel (frontend + API) + PostgreSQL (Drizzle ORM) cloud (database)
- **Observability:** Vercel Analytics + on-chain tx logs via Helius or Triton RPC
- **CI/CD:** GitHub Actions (test, typecheck, deploy preview per PR)
- **AI-assisted development:** Claude Code, v0.dev, Cursor

### 8.3 Security considerations

- All user input validated at API boundaries
- Environment variables for RPC endpoints, PostgreSQL (Drizzle ORM) keys, merchant treasury (never committed)
- PostgreSQL (Drizzle ORM) RLS so each merchant only sees their own invoices
- Content Security Policy headers
- Rate limiting on the Transaction Request endpoint (per-IP + per-reference)
- Slippage cap on Jupiter swaps (configurable; default 1%)
- Reference key collision prevention (crypto-random, 32 bytes)
- Explicit non-custodial guarantee: no server-side key holds funds
- Smart contract (if added) audited via standard Anchor tests + Sec3 linter

---

## 9. Business logic

### Fee model
- **MVP:** 0% protocol fee. Merchants pay only Solana network fees (<$0.001 per tx).
- **Production target:** 0.1–0.5% protocol fee, collected by routing a small portion of the swap output to an OnPay treasury PDA **inside the same atomic transaction**. Still non-custodial — funds are never held off-chain.
- Free tier for merchants processing <$1k/month.

### Non-custodial guarantee
At no point does OnPay's infrastructure hold buyer or merchant funds. Every payment is a single atomic transaction signed by the buyer. OnPay's servers generate the transaction but cannot execute or modify it. If OnPay goes offline, past payments are still recoverable on-chain, and merchants can continue receiving payments through any Solana Pay–compatible client.

### Settlement
- Merchants receive USDC directly in their connected wallet within the same transaction.
- Phase 2: optional fiat off-ramp to IDR, USD, EUR via local PSP partners.

---

## 10. Success metrics

### Hackathon (by 2026-05-11)
- [ ] MVP deployed and functional on mainnet-beta
- [ ] Public GitHub repo with clean README, setup guide, and demo video
- [ ] At least 3 different input tokens successfully tested (SOL, BONK, USDT → USDC)
- [ ] End-to-end payment flow completes in <10 seconds
- [ ] Lighthouse accessibility ≥ 95
- [ ] 100% TypeScript coverage, no `any` types
- [ ] Zero custodial code paths (reviewed line-by-line)

### Post-hackathon (first 6 months)
- [ ] 100 merchants onboarded
- [ ] $1M cumulative processed volume
- [ ] <0.5% effective fee to merchants
- [ ] Shopify plugin in review
- [ ] At least one signed LOI with a local Indonesian PSP for IDR off-ramp

---

## 11. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Jupiter slippage on low-liquidity tokens | Medium | Medium | Enforce max slippage; surface clearly in buyer UI; block tokens with no route |
| Solana tx size > 1232 bytes | Medium | High | Use Address Lookup Tables; split into versioned transactions |
| Regulatory (Indonesia crypto payments) | High | Medium | Non-custodial design avoids most licensing; engage local counsel before fiat off-ramp |
| Wallet adapter UX regressions | Low | Medium | Pin versions; regression-test on each wallet before demo |
| RPC rate limits during demo | Medium | High | Use Helius/Triton premium RPC for the judging period |
| Merchant adoption (post-hackathon) | High | High | Physical presence in Bali; free onboarding; printed QR kits |

---

## 12. Compliance with hackathon criteria

| Criterion | How OnPay addresses it |
|---|---|
| **Functionality / code quality** | TypeScript end-to-end, security-hardened, tested, linted, audited with clean commit history |
| **Potential impact / TAM** | Payment gateways = $100B+ market; crypto payments are the next leg; Indonesia alone has 60M+ UMKMs |
| **Novelty** | First non-custodial, token-agnostic, QR-native gateway composing Solana Pay + Jupiter in one atomic tx |
| **UX leveraging Solana performance** | <2s settlement, single signature, sub-cent fees — impossible on any other chain |
| **Open-source + composability** | Permissive license, public repo, published SDK, composes with Solana Pay + Jupiter + SPL Token as first-class primitives |
| **Business plan viability** | Clear go-to-market (Bali), fee model, off-ramp path, Phase 2 SDK strategy, existing mentor/ecosystem relationships |

---

## 13. Appendix: Why Solana

OnPay can only exist on Solana. Here's why:
- **Cost:** Sub-cent transaction fees mean a $0.50 coffee purchase is actually viable. On Ethereum L1, the gas alone would exceed the coffee.
- **Speed:** Sub-2-second finality is the minimum bar for in-person retail. No other L1 hits this reliably.
- **Jupiter liquidity:** The deepest aggregated SPL liquidity in crypto. Any-to-stable routing works for more than 50 tokens out of the box.
- **Solana Pay spec:** An official, standardized QR protocol. Every major wallet supports it. No other chain has this.
- **Mature wallet ecosystem:** Phantom and Backpack ship Web2-grade UX. The user education burden is low.

OnPay is a bet that Solana becomes the settlement layer for real-world commerce — and a move to make that bet real.
