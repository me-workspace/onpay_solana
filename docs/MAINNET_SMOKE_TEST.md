# Mainnet smoke test runbook

> Goal: ship **one real payment** on Solana mainnet-beta to prove the
> whole pipeline works end-to-end against live Jupiter and live RPC, then
> link the tx hash from the README as judge-facing evidence.
>
> Budget: ~$3 of SOL (≈0.02 SOL plus priority + swap fees + ATA rent).
> Time: 5 minutes once the wallet is funded.

---

## Prerequisites

- [ ] VPS deployed per `docs/DEPLOYMENT.md` with `https://onpay.id` live
      (or run against `http://localhost:3000` with `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`)
- [ ] Phantom mobile installed on your phone
- [ ] Phantom browser extension installed on the same laptop
- [ ] **Two different Solana wallets**:
  - A **merchant** wallet on the laptop (Phantom extension) that will
    receive the USDC
  - A **buyer** wallet on the phone (Phantom mobile) funded with
    at least **0.02 SOL** (≈$3)
- [ ] `.env.local` (or `.env.production` on the VPS) has:
  ```
  NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
  SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...   # or similar
  DEFAULT_SETTLEMENT_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v   # mainnet USDC
  ```

---

## Procedure

### 1. Register the merchant
1. Open `https://onpay.id/dashboard` on the laptop
2. Connect the Phantom extension → sign the auth message → you're in
3. Confirm the dashboard shows your merchant address in the welcome card

### 2. Create a tiny invoice
1. Click **New payment**
2. Amount: `0.10` USD (we're intentionally small — this is a live test)
3. Label: `mainnet smoke test`
4. Click **Generate QR**
5. The invoice page loads with a fullscreen QR code

### 3. Pay it from the phone
1. Open Phantom mobile → tap the Scan icon
2. Point the camera at the QR on the laptop
3. Phantom loads the Transaction Request from OnPay
4. Pick SOL as the input token
5. Review: you should see something like
   `Spend ~0.0007 SOL · Merchant receives 0.10 USDC · Slippage 1%`
6. Tap **Approve** and authenticate

### 4. Confirm on the dashboard
Within 2–5 seconds, the laptop should automatically flip to the green
"**Paid ✓**" view. If it doesn't within 10 seconds, hard-refresh the page.

### 5. Capture evidence
Open the Solscan link (the invoice page has a link to the tx hash). You
should see:
- A v0 versioned transaction
- Compute budget instructions
- An AssociatedTokenAccount idempotent create (if the merchant's USDC ATA
  didn't already exist)
- Multiple Jupiter swap instructions (the swap route)
- A Memo instruction mentioning the invoice reference
- The final USDC balance change: **+$0.10 to the merchant wallet**

**Copy the transaction signature** (base58 string, 88 chars).

---

## Update the README with evidence

Open `README.md` and find the "Mainnet proof" section (placeholder already
there). Replace the template with:

```markdown
## Mainnet proof

OnPay has been tested end-to-end on Solana mainnet-beta with a real payment.

- **Transaction**: [`<TX_HASH>`](https://solscan.io/tx/<TX_HASH>)
- **Date**: YYYY-MM-DD
- **Amount**: 0.10 USDC
- **Buyer paid with**: SOL (swapped via Jupiter)
- **Merchant received**: USDC directly in their associated token account
```

Commit the update with:
```
docs(readme): add mainnet smoke test proof (<TX_HASH prefix>)
```

---

## Troubleshooting

### The QR won't scan in Phantom
Hard-refresh Phantom mobile (force-close and reopen). If it still won't
scan, check that `NEXT_PUBLIC_APP_URL` in your env is reachable from the
phone — localhost URLs won't work unless you use your laptop's LAN IP.

### Jupiter returns "NO_ROUTE_FOUND"
The input token you picked has no route to USDC on mainnet. Pick a
liquid one (SOL, USDC, USDT, BONK, JUP).

### The invoice stays `pending` after paying
Check `/api/health` — if Solana RPC is degraded, `confirmInvoice` has
nothing to poll. Try again with a different `SOLANA_RPC_URL` (Helius is
reliable).

Also: the reference is queried against the RPC the server is configured
with, not the RPC Phantom used. If your `SOLANA_RPC_URL` lags behind
mainnet by a few slots, the confirmation will take an extra 1-2 seconds.

### The tx fails with "Transaction too large"
Shouldn't happen because the spike test already proved we fit in 1232
bytes, but if it does, the Jupiter route returned something exotic.
Retry — Jupiter may return a different route on the second call.

---

## Cleanup

No cleanup needed — the merchant row and the paid invoice are both
useful for the dashboard demo. Leave them in the DB; they become
demo content.
