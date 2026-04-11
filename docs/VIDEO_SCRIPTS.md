# OnPay — Video scripts (Colosseum submission)

> Ready-to-record scripts for both videos the Colosseum form requires.
> Target: one recording session, no heavy editing. Keep it honest, keep it fast.
>
> Videos must be hosted on YouTube, Loom, or Vimeo per the submission form.
> **Demo video**: up to 3 minutes, must show the live product (not slides, not a code walkthrough).
> **Pitch video**: up to 2 minutes, introduce yourself and the team, explain why you're the right person to build this.

---

## Recording checklist (do ONCE before either video)

### Hardware / software
- [ ] Clean desktop — close Slack, DevTools, other tabs
- [ ] OBS Studio or Loom configured for 1080p / 30fps
- [ ] Internal microphone test — no background noise, stable volume
- [ ] Browser zoom at 110% so UI text is readable in compressed YouTube playback
- [ ] Phantom browser extension + Phantom mobile on the same Wi-Fi network

### OnPay state
- [ ] Production build deployed to Hostinger VPS (see `docs/DEPLOYMENT.md`)
- [ ] `onpay.app` (or whichever final URL) resolves with HTTPS
- [ ] Mainnet-beta wallet with ≥ $3 SOL for the live transaction
- [ ] A second wallet (merchant) already registered and visible on the dashboard
- [ ] At least one previous paid invoice in the dashboard (real, from the smoke test)
  so the Recent Payments table isn't empty

### Content
- [ ] Script printed or on a second monitor
- [ ] Demo order written down: "Iced Latte × 2 — $4.00 USD"
- [ ] Tx hash from a past mainnet payment for the closing frame

---

## DEMO VIDEO — 3 minutes max

**Goal:** make the judge feel the moment of real-world adoption. Show the product working on mainnet, not a slide deck.

### Structure (3:00 total)

**0:00 – 0:15 · Hook**
Bali café interior, cup of coffee, handwritten menu.

> "This is Kopi Canggu, a real café in Bali. The owner Kadek loses 2.5% of every sale to card processors, and she can't accept the crypto her customers are asking about. In about two minutes, we're going to fix both of those things on-screen."

Cut to OnPay logo + tagline on the landing page at `onpay.app`.

---

**0:15 – 0:35 · The merchant setup**
Record the browser: landing page → `/dashboard` → connect Phantom → sign nonce → merchant registered.

> "Kadek opens OnPay. She clicks 'Open dashboard' and connects Phantom. She signs one message to prove she owns the wallet — no password, no email, no KYC. In under thirty seconds, she has a merchant account. Her wallet address IS the account."

---

**0:35 – 0:50 · Creating an invoice**
Click "New payment", enter `4.00 USD`, label `Iced Latte x2`, submit. Show the generated QR code fullscreen.

> "She taps 'New payment', enters four dollars, adds a label. One click. She now has a Solana Pay QR code that any wallet can pay."

---

**0:50 – 2:10 · The buyer flow (the money shot)**

Switch to phone camera or phone-mirroring view. Real mainnet payment.

> "Over at the counter, the customer scans the QR with Phantom mobile."

(scan happens)

> "The wallet asks them which token they want to pay with. They happen to hold BONK, so they pick BONK. Notice — the merchant doesn't care what the buyer pays with."

(pick token, wallet shows the quote)

> "Phantom shows exactly what's about to happen: spend X BONK, merchant receives 4 USDC, slippage 0.3 percent. The buyer taps Approve, signs with their biometric."

(approve tap, short pause)

> "Two seconds later..."

Switch back to the merchant dashboard screen.

> "Kadek's dashboard lights up. Paid. Four USDC landed directly in her wallet. No holding period, no custody, no chargebacks."

Point at the Solscan link.

> "Here's the on-chain proof — let me open it."

Click Solscan link, show the actual mainnet transaction with the swap + transfer instructions.

> "One transaction. Jupiter swap. USDC transfer. Atomic. Nobody in the middle."

---

**2:10 – 2:35 · Architecture in 25 seconds**
Single slide (just one, not a deck) — the ASCII component diagram from the README.

> "Under the hood, three Solana programs compose into one atomic transaction. Jupiter handles the swap. The SPL Token program handles the transfer. A memo instruction carries the invoice reference so our backend can confirm the payment by querying any RPC. OnPay's servers never touch the money — they just build the transaction."

---

**2:35 – 2:55 · Business close**

> "Card processors charge Bali merchants 2.5 percent and make them wait three days. OnPay charges under 0.5 percent and settles in under two seconds. The total addressable market is every SME in Southeast Asia with tourist traffic, and we're starting right here in Canggu. Post-hackathon, we ship a fiat off-ramp so Kadek can cash out to her local bank in under a day."

---

**2:55 – 3:00 · Close**

> "OnPay. Pay in any SPL token. Merchants receive USDC. Built in Bali."

Cut to: GitHub URL + live demo URL on screen.

### Shot list
1. Café exterior / interior (10s) — B-roll
2. Landing page (3s)
3. Dashboard: connect flow (15s)
4. Dashboard: create invoice (10s)
5. QR fullscreen (3s)
6. Phone: scanning the QR (8s)
7. Phone: Phantom token picker (5s)
8. Phone: approval screen (5s)
9. Phone: confirmation (3s)
10. Dashboard: "Paid ✓" (5s)
11. Solscan: on-chain transaction breakdown (8s)
12. Architecture slide (20s)
13. Business stats slide (15s)
14. Final frame: logo + URLs (5s)

### Editing notes
- No music under narration. Music only under B-roll at 30% volume.
- Every cut should be motivated by the narration, not arbitrary.
- Subtitles / captions strongly recommended — YouTube auto-generated is fine if the audio is clean.

---

## PITCH VIDEO — 2 minutes max

**Goal:** Judges know who Wira is, why this project, why now, why him.

### Structure (2:00 total)

**0:00 – 0:15 · Who**
Talking head, good natural light, plain background.

> "Hi, I'm Wira. I'm a solo founder based in Canggu, Bali. I've been building software for ten years, most recently shipping AI products for Indonesian SMEs, and I've got a Solana Bali Builders mentor pass for this hackathon."

---

**0:15 – 0:45 · What**

> "I'm building OnPay — a non-custodial payment gateway on Solana. Buyers scan a QR, pick any SPL token they already hold, sign once, and the merchant's wallet receives USDC in under two seconds. All inside a single atomic transaction composed of a Jupiter swap and an SPL transfer. Our servers never touch the money."

---

**0:45 – 1:15 · Why now**

> "Three things had to line up, and they just did. Sub-cent Solana fees finally make $0.50 coffee purchases economically viable. Sub-two-second finality is the minimum bar for in-person retail — no other chain clears it. And Jupiter's aggregated liquidity, which covers 50-plus SPL tokens now, didn't exist eighteen months ago. Stablecoin payments are also crossing the mainstream threshold. Visa, Stripe, and PayPal all shipped USDC rails in the last year. The winning design for merchant payments is non-custodial and token-agnostic, and nobody has shipped that reference implementation yet. I'm building it."

---

**1:15 – 1:45 · Why me**

> "I live in Bali. Every week I watch café owners turn away European tourists who want to pay in SOL. I watch the same café owners hand 2.5% of their revenue to a card processor that settles in three days. I'm not theorizing about this pain — I can walk to the café, show the owner the QR, and sign up merchant number one in person. My go-to-market is door-to-door in Canggu and Ubud, not a Twitter launch. The Solana Bali Builders program gives me direct access to the ecosystem. I already have the relationships, the physical presence, and a working product on mainnet."

---

**1:45 – 2:00 · Ask**

> "I'm asking the Colosseum accelerator for the capital and network to go from one café to a hundred in six months, sign a local PSP partnership for fiat off-ramp, and ship our TypeScript SDK so any e-commerce store globally can embed OnPay. The hackathon judges can see the product working today. I'd love to build the company tomorrow. Thanks."

---

### Recording notes
- Do three full takes, keep the best.
- Look at the camera, not the screen.
- It's okay to pause for a beat between sections — just cut the pauses in post.
- Background: plain wall, a plant, or the repo visible on a second monitor. NOT a busy café — too noisy.

---

## Post-recording checklist

- [ ] Upload demo video to YouTube as **unlisted** (can flip to public later)
- [ ] Upload pitch video to YouTube as **unlisted**
- [ ] Both videos have descriptive titles: `OnPay — Demo (Solana Frontier Hackathon 2026)` / `OnPay — Pitch (Wira, Solana Frontier Hackathon 2026)`
- [ ] Description includes: GitHub URL, live demo URL, one-line project summary
- [ ] Paste both URLs into `docs/HACKATHON_SUBMISSION.md` (replacing the `TBD` placeholders)
- [ ] Paste both URLs into the Colosseum form
- [ ] Ship the submission at least 24 hours before the May 11 deadline
