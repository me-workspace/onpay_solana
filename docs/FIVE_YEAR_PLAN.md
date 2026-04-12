# OnPay — Five-Year Strategic Plan

From hackathon MVP to the default payment gateway of Southeast Asia.

---

## 1. Executive summary

OnPay is a non-custodial payment gateway built on Solana. The hackathon MVP proves the atomic any-SPL-token-to-USDC flow works end-to-end. This document lays out the path from that proof point to a full-fledged payment platform — comparable in scope to Stripe globally and to Midtrans in Indonesia — over the next five years.

The thesis is simple: **crypto rails are 10x cheaper and 100x faster than card rails, and Southeast Asia is the first place on earth where the buyer base, the merchant pain, and the regulatory window all line up.** OnPay's unfair advantage is being non-custodial by construction: funds flow atomically from buyer to merchant without OnPay ever holding them. That single design choice collapses huge categories of compliance cost and operational risk that every other payment processor carries.

The plan below is phased by year, with explicit decisions, metrics, and checkpoints.

---

## 2. The benchmarks we must match (and exceed)

### 2.1 Stripe — what it really is

Stripe is not "a way to take a payment." It is four products sold as one:

1. **Integration surfaces** — hosted Checkout, embedded Elements, Payment Intents API, mobile SDKs, plugins for Shopify, WooCommerce, Magento, etc.
2. **Reliability infrastructure** — signed webhooks, idempotency keys, test mode, sandbox, automatic retries, audit logs, 13 years of backward-compatible API versioning.
3. **Merchant operations** — refunds, disputes, settlement reports, payout schedules, tax invoices, accountant exports.
4. **Financial services layered on top** — Connect (marketplaces), Billing (subscriptions), Issuing (cards), Terminal (POS), Treasury (yield), Radar (fraud), Tax, Climate.

Stripe won because the first `curl` call worked and the docs were good. OnPay has to match that bar.

### 2.2 Midtrans — what Stripe never figured out

Midtrans dominates Indonesia because it solved the local layer Stripe does not touch:

- **QRIS** (national QR standard, interoperable across every Indonesian wallet).
- **Virtual Accounts** (BCA, Mandiri, BNI, BRI, Permata).
- **E-wallets** (OVO, GoPay, DANA, ShopeePay, LinkAja).
- **Convenience store payments** (Alfamart, Indomaret).
- **Installments** (cicilan 0% via partner banks).
- **Local compliance** (BI/OJK registration, e-Faktur-compatible tax output, IDR-native invoicing).

Any plan for OnPay that does not eventually absorb this local layer is not a plan for winning Indonesia.

### 2.3 Today's OnPay

What exists: non-custodial Solana Pay QR generator, merchant dashboard, wallet-based auth, invoice lifecycle, stats. Roughly 3% of what a full gateway is. The 3% we picked is the hardest technical piece — atomic on-chain settlement — so the remaining 97% is mostly execution, not invention.

---

## 3. OnPay's unfair advantages

These are the things Stripe and Midtrans **cannot** copy without rebuilding their entire stack. Every year of the plan amplifies at least one of these.

- **Non-custodial by construction.** Funds touch buyer and merchant atomically. No float, no trust, no "we're holding your money." This shields OnPay from huge chunks of licensing that trap Stripe in every country.
- **Sub-two-second finality and sub-cent fees.** A Rp 5,000 coffee is economically viable. Card processors literally cannot do this.
- **Global by default.** A merchant in Ubud accepting from a tourist's Phantom wallet settles the same as a merchant in Berlin. No cross-border setup, no FX markup, no SWIFT.
- **Wallet equals account.** No KYC friction for onboarding at small volumes. No signup funnel drop-off.
- **Programmable at the instruction level.** Every transaction is a composable set of Solana instructions — refunds, splits, escrow, royalties, subscriptions, loyalty points all become code.
- **No chargebacks.** Merchants save 0.5 to 2% in fraud reserves compared to card networks.

---

## 4. The five-year roadmap

### Year 1 — "Stripe Checkout for Solana"

Goal: a merchant with any website can accept crypto in under ten minutes of developer work.

#### Core API and authentication model

- API keys (publishable + secret), scoped, rotatable, with explicit test and live separation.
- API key to merchant wallet binding; one merchant can hold multiple keys.
- Test mode runs on Solana devnet, live mode on mainnet.
- REST endpoints: `/v1/payment_intents`, `/v1/invoices`, `/v1/refunds`, `/v1/events`, `/v1/customers`, `/v1/webhook_endpoints`.
- Idempotency keys on every POST, with Stripe-compatible semantics.
- API versioning via `OnPay-Version: 2026-05-01` header. Every breaking change is opt-in forever.

#### Webhooks that actually work

- Signed with HMAC-SHA256; header format compatible with existing Stripe webhook parsers.
- Automatic retries with exponential backoff for 48 hours.
- Dashboard view with webhook log, replay button, latency, delivery status.
- Events: `invoice.created`, `invoice.paid`, `invoice.expired`, `refund.created`, `payout.settled`.

#### Hosted Checkout at `pay.onpay.id/[session]`

- Mobile-first, wallet-connect from any Solana wallet, Solana Pay deep link on mobile.
- Merchant branding: logo, color, name.
- i18n: English and Indonesian first.
- Configurable success and cancel return URLs.
- Apple Pay and Google Pay card fallback via Stripe Crypto Onramp (buyer pays card, USDC lands atomically in merchant wallet).

#### Server SDKs

- TypeScript / Node (priority 1 — matches the stack most Indonesian SaaS is built on).
- Python, PHP (WordPress ecosystem), Go.

#### Plugins

- WooCommerce (priority 1 — huge in Indonesia).
- Shopify App (requires going through their review).
- Open-source Next.js reference integration repo.

#### Dashboard v2

- API key management, webhook endpoints, test mode toggle.
- Refunds UI (triggers an on-chain push from merchant wallet back to buyer reference).
- Settlement reports (CSV export for accountants).
- Tax invoice PDF export in Indonesian e-Faktur-compatible format.

#### Compliance groundwork

- Terms of service that codify the non-custodial claim, reducing OnPay to "software tool" regulatorily.
- OFAC and Chainalysis sanctions screening on every transaction (buyer wallet check).
- Legal memo from Indonesian counsel on whether PJPK registration is required given non-custody.

#### Year 1 metrics

- 50 live merchants.
- 10,000+ transactions per month.
- <1% failed transaction rate.
- 99.9% API uptime.
- One Shopify app in the App Store.

---

### Year 2 — "Payment Elements and the Indonesia bridge"

Goal: OnPay becomes the default crypto option in Indonesian e-commerce, and starts to feel like a real SDK.

#### Embedded payment UI

- `<OnPayElements>` React component, plus Vue, Svelte, vanilla JS.
- Drop-in iframe widget for non-React sites.
- Mobile SDKs: React Native, Flutter, native iOS (Swift), native Android (Kotlin).
- Design system parity with Stripe Elements. Must look professional out of the box.

#### The Indonesia layer — the critical differentiator

- **QRIS interop.** Generate a QR that contains both Solana Pay and QRIS payloads. Merchant sees one price tag and accepts both. Solana Pay wallets scan normally; QRIS scans go through a partner PJP (ESB, Flip, DOKU) that accepts IDR, swaps to USDC, and settles to the merchant wallet.
- **IDR pricing with live FX.** Merchant enters "Rp 25.000", OnPay locks the USDC equivalent for five minutes at checkout.
- **Fiat off-ramp for merchants.** One click to cash out USDC to IDR via Reku, Pintu, or Tokocrypto bank transfer (BCA / Mandiri / BNI). Same-day settlement.
- **WhatsApp invoicing.** A warung owner sends a WhatsApp message with a pay link; buyer clicks and pays with wallet or QRIS.

#### Subscriptions v1

- On-chain delegation pattern: buyer signs once, authorizing N monthly pulls up to M USDC.
- Cancel anytime via wallet signature.
- Merchant dashboard for recurring customers and churn view.

#### Wallet-less checkout

- Privy and Web3Auth integration: buyer logs in with email, OnPay creates a burner Solana wallet, buyer pays with card, card processor on-ramps to USDC, transaction proceeds.
- This removes the "I do not have a crypto wallet" objection that blocks 90% of the addressable market.

#### More plugins

- Magento 2, PrestaShop, OpenCart.
- Wix, Squarespace, Webflow (hosted Checkout embed).
- Laravel package (big in the Indonesian developer community).
- n8n, Zapier, Make connectors.

#### Year 2 metrics

- 500 live merchants.
- Rp 50 billion GMV per month.
- WhatsApp invoicing live for warung use case.
- First meaningful Indonesia product-market fit.
- First 1% take-rate revenue realized.

---

### Year 3 — "OnPay Connect" (marketplaces, platforms, and developer moat)

Goal: OnPay becomes the payment rails other Indonesian platforms build on.

#### Multi-party payments — the Stripe Connect moment

- Single transaction splits funds atomically: marketplace 10%, seller 85%, platform 3%, creator royalty 2%.
- Targets: Tokopedia-style marketplaces, Patreon-style creator tools, ride-share-style driver payouts.
- Programmable via on-chain instructions; atomic settlement to all parties.

#### Invoicing as a standalone product

- Merchant creates invoice; OnPay emails or WhatsApps the buyer; buyer pays anytime.
- Recurring schedules, automatic reminders, partial payments, late fees.
- Dunning: automatic retry for failed subscription pulls.

#### Fraud and compliance v2

- Wallet risk scoring (Chainalysis, TRM Labs, Elliptic integrations).
- Velocity rules, geo blocks, BIN blocks for card on-ramp.
- Dispute workflow with human-in-the-loop merchant / buyer reconciliation, for trust (even though there are no chargebacks).
- Formal PJPK and PPMSE registration in Indonesia.
- Singapore MPI exploratory filing.
- EU MiCA readiness.

#### POS terminal mode

- Merchant tablet or phone app: enter amount, customer scans or taps, transaction settles in two seconds, printable receipt.
- Offline mode: buyer signs, merchant queues, transaction syncs when back online.
- Hardware partner (Sunmi or Imin Android POS) — preload OnPay.

#### Developer platform

- Public API docs at Stripe quality: interactive, copy-paste, multi-language examples.
- Postman collection, OpenAPI spec.
- DevRel: weekly livestream, Discord community, "Built on OnPay" showcase, hackathons.
- Grants program for apps built on OnPay.

#### Year 3 metrics

- 5,000 live merchants.
- Rp 500 billion GMV per month.
- Three marketplaces live on OnPay Connect.
- POS app deployed in 100+ physical shops.
- First Southeast Asia expansion: Philippines, Vietnam, Thailand.

---

### Year 4 — "Global stablecoin rails and embedded finance"

Goal: OnPay is how internet businesses move money, not just how they accept payments.

#### Multi-chain expansion (finally)

- Extend settlement to Base, Arbitrum, Polygon PoS. Always lands as a stablecoin.
- Cross-chain via CCTP for USDC, LayerZero or Wormhole for USDT.
- Solana remains the primary rail for speed; other chains unlock "buyer already holds on chain X" edge cases.

#### Cross-border B2B — the Wise competitor

- Indonesian merchant invoices a US client in USD.
- Client pays with bank transfer (ACH, wire).
- OnPay delivers IDR to the merchant's bank the same day.
- Under the hood: USD → USDC → IDR via local liquidity partner.
- 10x cheaper than SWIFT, same-day versus three-to-five business days.

#### Embedded finance

- **OnPay Balance.** Merchants keep USDC in-app and earn 4–5% yield via Solend, Kamino, or MarginFi. Disclosed and opt-in.
- **OnPay Card.** Virtual Visa or Mastercard tied to USDC balance; spendable anywhere, via an issuer BaaS partner (Rain, Bridge, or direct).
- **OnPay Capital.** Merchant cash advance against next-30-days OnPay revenue, similar to Stripe Capital.

#### White-label and BaaS

- Digital banks (Jago, BCA Digital, neobank-X) can rebrand OnPay's rails as their own crypto gateway.
- API license deal, co-branded dashboard.

#### Year 4 metrics

- 50,000 merchants.
- Rp 5 trillion GMV per month.
- OnPay Card in 1,000+ wallets.
- One BaaS partnership live.
- Presence in six ASEAN countries.

---

### Year 5 — "Bloomberg-status default"

Goal: when a Southeast Asian founder thinks "accept payments," OnPay is the first and often only answer.

#### Treasury and banking convergence

- Merchant receives a virtual IDR bank account number via VA partner.
- Inbound IDR auto-converts to USDC; outbound USDC auto-converts to IDR.
- Business account with payroll, vendor payments, tax payments, accounting sync (Xero, Jurnal, Accurate, Zahir).
- Multi-entity support (holding and subsidiaries), role-based access.

#### AI-native operations

- Automatic tax reporting, with e-Faktur generation from the OnPay ledger.
- Fraud detection model trained on OnPay's own transaction graph.
- AI customer support that can actually execute refunds and dispute resolutions.
- Predictive cash flow: "You will have a gap on Thursday; here is a loan offer."

#### Stablecoin neutrality

- Support USDC, USDT, PYUSD, EURC, IDRT (if it matures), and Indonesia's future CBDC (Garuda) when it launches.
- Merchant chooses settlement denomination per-account or per-customer.

#### Global licensing portfolio

- Indonesia: full PJPK with KSEI custodian partnership if ever required.
- Singapore: MPI (Major Payment Institution).
- EU: MiCA e-money token issuer or CASP.
- US: state money transmitter licenses (or partnership route).
- Hong Kong: Stored Value Facility.

#### Year 5 metrics

- 500,000 merchants.
- Rp 50 trillion GMV per month.
- Profitability.
- 50% of Indonesian Shopify-equivalent stores use OnPay.
- Acquisition offers from Visa, Mastercard, GoTo, Sea Ltd.

---

## 5. Strategic bets that compound from Year 1

These are the early decisions that pay off across every later year. Getting them wrong is expensive; getting them right is free leverage.

### 5.1 Freeze the API shape now

Stripe's API is 13 years old and still backward compatible. OnPay must adopt the same discipline from day one. Version with the `OnPay-Version` header. Every breaking change must be opt-in, forever. The cost of discipline is small; the cost of a breaking migration at scale is catastrophic.

### 5.2 Publish the fee model upfront

Recommended schedule:

- **Hackathon / MVP:** 0.5% flat.
- **First 1,000 merchants:** 0.9%.
- **At scale:** 1.9% + $0.30 for card fallback, 0.9% for wallet-native.

Always 4x cheaper than Stripe for wallet payments. Comparable for card fallback. Publish it. Never surprise merchants with undisclosed adjustments.

### 5.3 Non-custody is a product claim AND a compliance shield

Bake non-custody into the legal structure. The OnPay entity must never hold signing keys to merchant funds — verified with counsel, documented in terms of service, enforced architecturally. This single property keeps OnPay out of "money transmitter" classification in most jurisdictions and out of Bappebti licensing in Indonesia.

The day non-custody breaks — for example, to enable subscriptions by holding funds between pulls — is the day OnPay needs a balance sheet and a banking license. That line must be crossed deliberately, not accidentally.

### 5.4 Developer experience is the moat, not the technology

Stripe won because `curl` worked on the first try and the docs were good. Not because of algorithmic breakthroughs. Invest 30% of engineering effort in DX from Year 1: docs, SDKs, error messages, CLI, sandbox, sample apps, test coverage.

### 5.5 Ship Indonesia hard before going regional

Depth beats breadth. A warung in Ubud accepting USDC via WhatsApp is a better story than a lukewarm multi-country presence. Year 1 and 2 ship nothing that is not validated against a real Indonesian merchant.

### 5.6 Never build custody-backed subscriptions

Use on-chain delegation (token authorizations, streaming payments via Streamflow or Zebec patterns). The moment OnPay holds funds to batch-charge customers, it becomes a custodian — which destroys the non-custody advantage.

### 5.7 Open source the core

MIT-license the SDKs, plugins, and on-chain programs. Keep only the dashboard, risk engine, and analytics closed-source. This attracts contributors and makes enterprise security audits trivial.

### 5.8 Hire compliance before the third engineer

A single regulatory mistake in Year 1 ends the company. A compliance hire buys OnPay the right to build. Not optional, not a Series-A problem, not delegable to counsel on retainer.

---

## 6. The next 90 days

If the question is "what is the single next feature that unlocks the most future value," the answer is:

> **API keys + idempotent create-invoice endpoint + signed webhooks + hosted checkout at `pay.onpay.id/[session]`.**

That is the Year 1 foundation in its smallest possible form. Everything else — SDKs, plugins, Elements, subscriptions, Connect — is a wrapper around those four primitives. Once they exist and are stable, they can be launched incrementally without refactors.

After those four, the next thing to build is the WooCommerce plugin. It validates the whole stack end-to-end against a real merchant use case and converts the first 10 paying customers.

Everything in Years 2 through 5 is downstream of getting this quarter right.

---

## 7. Closing

The hackathon MVP proves the hard part is already solved: atomic any-token-to-USDC settlement in under two seconds, non-custodially, on a public blockchain. From here, the work is not technical invention. It is disciplined execution against a product spec that every developer already understands, served to a market (Southeast Asia) where the existing rails are 10x too expensive and 100x too slow.

Stripe took 13 years to become Stripe. Midtrans took 10 to become Midtrans. OnPay has a faster path because the rails already exist — Solana, Jupiter, Solana Pay, USDC. The job is to wrap them in the right API, the right docs, the right local integrations, and the right compliance posture.

Five years from today, when a founder in Jakarta opens a new project and types `npm install`, the first line of backend code they write should be `import { OnPay } from "@onpay/node"`.

That is the plan.
