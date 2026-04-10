# Security

This document tracks security posture, accepted risks, and response procedures for OnPay.

## Reporting a vulnerability

If you discover a security issue, **please do not open a public GitHub issue**.
Instead, contact the maintainer directly via the Telegram handle listed in the
repository's submission metadata. We will acknowledge within 24 hours and
target a fix within 7 days for high-severity issues.

## Security model

OnPay is **non-custodial**: buyer funds flow directly to the merchant's
wallet inside a single atomic Solana transaction. OnPay's servers:

- Build transactions (unsigned) on behalf of the buyer's wallet
- Store invoice metadata (amount, reference, merchant ID)
- Monitor on-chain for confirmed payments

OnPay's servers **never**:

- Hold private keys
- Custody user funds
- Modify signed transactions
- Execute transactions on behalf of users

This means the worst-case compromise of OnPay's infrastructure cannot move
user funds. It can, at most, cause invoices to fail to generate or cause the
merchant dashboard to show stale data.

## Hardening checklist

This checklist is audited before every release. See also the "Security review
checklist" section in [`PLAN.md`](./PLAN.md).

- [x] TypeScript strict mode with all strict flags enabled
- [x] Zod validation at every API boundary
- [x] Environment variables validated at module load time (fail-fast)
- [x] Content Security Policy configured in `next.config.ts`
- [x] HSTS, X-Frame-Options, X-Content-Type-Options headers set
- [x] No `dangerouslySetInnerHTML` in React components
- [x] Structured logger with automatic PII redaction
- [x] Supabase Row-Level Security policies for all tables
- [x] Service-role Supabase client gated behind a runtime guard preventing
      it from being constructed in client bundles
- [x] Pinned exact dependency versions
- [x] Dependabot enabled for weekly dependency hygiene
- [x] GitHub Actions CI audit on every push
- [ ] Rate limiting on mutating endpoints (scheduled for Week 2)
- [ ] Wallet signature verification on merchant-auth endpoints (scheduled for Week 2)
- [ ] Slippage cap enforced end-to-end (partial — enforced at quoter layer)
- [ ] End-to-end security review against the Week 4 checklist

## Accepted risks

### `bigint-buffer` transitive dependency

**CVE:** [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg)
**Severity (CVSS):** High
**Affected packages:** `@solana/web3.js`, `@solana/spl-token`, `@solana/pay`
**Fix available:** No (upstream Solana ecosystem)
**Risk assessment:** Accepted

`bigint-buffer`'s `toBigIntLE()` function has a buffer overflow when called
with byte arrays longer than expected. The Solana web3.js library uses this
function internally to deserialize on-chain account data. In OnPay's context,
we never pass untrusted buffers to this function directly: all inputs come
from our own RPC calls, which query trusted Solana RPC endpoints. An attacker
who could control the RPC response could, in theory, exploit this — but doing
so would require MITM'ing a trusted RPC endpoint over HTTPS, at which point
they have already compromised something more valuable.

We are tracking upstream Solana SDK releases and will remove this exception
as soon as a fix is published. Monitor:

- https://github.com/solana-foundation/solana-web3.js/issues
- https://github.com/solana-program/token/issues

CI audit runs with `--audit-level=critical` to allow builds to proceed.
Dependabot will continue to surface new advisories via PRs.

## Incident response

If a security incident is detected:

1. **Isolate.** Disable the affected API route via Vercel's dashboard.
2. **Communicate.** Post to the merchant Telegram channel and the public
   status page if the merchant dashboard is affected.
3. **Diagnose.** Pull Vercel logs + Supabase logs for the affected time window.
4. **Patch.** Fix the root cause in a hotfix branch and deploy.
5. **Postmortem.** Write a public postmortem within 7 days of resolution.

Because OnPay is non-custodial, the blast radius of an incident is inherently
limited to service availability and data integrity — never user funds.
