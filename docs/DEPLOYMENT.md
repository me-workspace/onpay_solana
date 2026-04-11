# OnPay — Production deployment (Hostinger VPS)

> **Live at:** https://onpay.id
> **Deployed:** 2026-04-11
> **Host:** Hostinger VPS `76.13.23.29` (Ubuntu 24.04, WordOps stack)
> **Port:** OnPay runs on `127.0.0.1:3456` behind WordOps's `nginx-custom`
> **Database:** Local PostgreSQL 16, database `onpay`, role `onpay`
> **Solana cluster:** `devnet` (switch to mainnet-beta before the smoke test)

This document reflects the actual production state after the initial
bootstrap on 2026-04-11. Use it as the runbook for subsequent deploys,
rollbacks, and incident recovery.

---

## 1. VPS topology

The VPS is a shared host running multiple Wira projects via **WordOps**
(a WordPress/nginx management stack). OnPay is a **reverse-proxy site**
inside this stack; it does NOT own the nginx installation. Coexisting
projects on the same box:

- `soft-render.myskillset.me` — SLA Architectural AI (Node on port 3000)
- `sla-development.myskillset.me` — SLA development site
- `22222` — WordOps admin panel (HTTPS on :22222)
- `onpay.id` / `www.onpay.id` — this project

**Important**: do NOT run `apt install nginx` or `apt install nginx-full`
on this host. Those packages will displace WordOps's `nginx-custom`
package, which has compiled-in modules (`more_set_headers`, etc.) that
the other sites' configs depend on. An earlier bootstrap attempt did
exactly this and took all three sites offline until recovery — see the
`_recover_and_deploy.py` script for the repair procedure.

---

## 2. What's on the box

- **Ubuntu 24.04**, Node 22, PM2, Postgres 16, WordOps 3.22+
- **Nginx**: `nginx-custom` (WordOps flavor), configs in `/etc/nginx/sites-enabled/`
- **OnPay app**: `/home/deploy/onpay_solana/` — cloned from `origin/main`
- **PM2 process**: `onpay`, user `deploy`, binds to `127.0.0.1:3456`, `ecosystem.config.cjs` at repo root
- **Certs**: `/etc/letsencrypt/live/onpay.id/` issued via `certbot certonly --webroot` — auto-renews via the standard certbot systemd timer
- **DB**: PostgreSQL listening on `127.0.0.1:5432`, database `onpay`, role `onpay` with password stored in `.env.production` (and a backup at `~/.ssh/onpay_vps_secrets.json` on the operator's laptop)
- **Env file**: `/home/deploy/onpay_solana/.env.production` (chmod 600, never committed)

---

## 3. Recurring deploys

### Option A — Manual (current default)

```bash
ssh deploy@76.13.23.29
cd onpay_solana
./deploy/deploy.sh
```

The `deploy.sh` script pulls `origin/main`, installs deps, runs
migrations, rebuilds the standalone bundle, copies static assets,
reloads PM2, and health-checks the new process. Rolls back cleanly
if the health check fails.

### Option B — GitHub Actions auto-deploy

`.github/workflows/deploy.yml` triggers on push to `main`. It's a no-op
until these secrets are set with `gh secret set`:

```bash
gh secret set DEPLOY_HOST      # 76.13.23.29
gh secret set DEPLOY_USER      # deploy
gh secret set DEPLOY_SSH_KEY   # contents of ~/.ssh/onpay_vps_ed25519
```

---

## 4. First-time bootstrap (already done, reference only)

The `deploy/_recover_and_deploy.py` script handles the full bootstrap in
one invocation. It assumes a WordOps VPS and preserves coexisting sites.

```bash
VPS_ROOT_PASSWORD='...' python deploy/_recover_and_deploy.py
```

Stages:
1. Repair nginx if it was broken by an earlier upstream install
2. Create the `deploy` user with sudo + install the ed25519 key
3. Create the `onpay` Postgres role + database
4. Clone the repo as `deploy`, write `.env.production`, install, migrate, build
5. Start PM2

Then, **NOT via `wo site create`** (which is buggy), use
`deploy/_certbot_webroot.py` to add the nginx vhost and provision
HTTPS:

```bash
VPS_ROOT_PASSWORD='...' python deploy/_certbot_webroot.py
```

This script:
1. Prepares `/var/www/html/.well-known/acme-challenge/`
2. Issues a Let's Encrypt cert via `certbot certonly --webroot` (no nginx plugin required)
3. Writes `/etc/nginx/sites-available/onpay.id` with the full HTTPS server block
4. Tests + reloads nginx
5. Verifies `https://onpay.id/api/health` returns 200

### Why not `wo site create --proxy=[...] -le`?

WordOps's site creation command threw "There was a serious error
encountered..." mid-flow, rolled back the config, and then corrupted
its internal state by editing `/var/www/22222/conf/nginx/ssl.conf` to
reference a vhost that no longer existed. The manual path is simpler
and doesn't touch WordOps's own admin state.

---

## 5. Rollback

### App rollback

```bash
ssh deploy@76.13.23.29
cd onpay_solana
git log --oneline -5    # find the last known-good commit
git reset --hard <sha>
./deploy/deploy.sh
```

### Cert rollback

Let's Encrypt certs are versioned. Previous archives live in
`/etc/letsencrypt/archive/onpay.id/`. Symlinks in `/etc/letsencrypt/live/`
point at the current active version.

### Nginx rollback

The `_recover_and_deploy.py` script is idempotent — rerun it if nginx
state gets corrupted. It reinstalls `nginx-custom` and validates other
sites are still up.

### DB rollback

drizzle-kit does not generate down migrations. Roll back manually via SQL.
**Always test migrations on a dev Postgres before touching prod.**

---

## 6. Observability

```bash
# App logs
ssh deploy@76.13.23.29
pm2 logs onpay --lines 100

# Nginx access
sudo tail -f /var/log/nginx/onpay.id.access.log

# Nginx errors
sudo tail -f /var/log/nginx/onpay.id.error.log

# App health
curl https://onpay.id/api/health

# Full PM2 status
pm2 status

# System load / memory
htop
```

---

## 7. Known quirks

1. **Port 3000 and 3001 are taken by other projects on this VPS.** OnPay runs on **3456**. Don't change it without updating the nginx vhost at the same time.
2. **`DATABASE_POOL_MAX=20`** in `.env.production` (vs the repo default of 5 which is tuned for serverless). Don't lower it.
3. **`NEXT_PUBLIC_SOLANA_CLUSTER=devnet`** currently. Switch to `mainnet-beta` + a paid Helius RPC URL for the mainnet smoke test (task #5 in the roadmap).
4. **Cron for invoice expiration** is not yet configured. Add this to `deploy` user's crontab once we have the `CRON_SECRET` in production:
   ```
   * * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://onpay.id/api/cron/expire-invoices >> /home/deploy/onpay-cron.log 2>&1
   ```
   Replace `$CRON_SECRET` with the actual value from `.env.production`.
5. **Certbot auto-renews** via the system systemd timer (`certbot.timer`). Test with `sudo certbot renew --dry-run` monthly.
6. **WordOps admin panel** runs on port **22222** over HTTPS. Don't enable UFW without leaving that port open — you'll lock yourself out of WordOps management.
7. **The `deploy` user has passwordless sudo.** Audit `sudoers.d/deploy` if you need to tighten this — the initial deploy needed it for WordOps operations.
8. **Nginx vhost caveats**: the `ssl_session_cache` directive is declared globally by WordOps with a 50m shared zone. Do NOT redeclare it inside the onpay.id vhost — nginx will refuse to reload with a shared-memory-zone conflict.

---

## 8. Secrets locations

- **Local operator backup**: `~/.ssh/onpay_vps_secrets.json` (on Wira's laptop only) — contains JWT_SECRET, CRON_SECRET, DB password, DATABASE_URL. Chmod 600.
- **VPS env**: `/home/deploy/onpay_solana/.env.production` (chmod 600, owned by `deploy`)
- **SSH private key**: `~/.ssh/onpay_vps_ed25519` (on Wira's laptop only)
- **Initial root password**: in `VPS Hostinger Access.txt` in the parent project folder — **should be rotated now** since the initial bootstrap is complete. Key-based auth is in place for the `deploy` user, but root SSH with the original password is still enabled as a fallback. Change the root password via `passwd` over SSH when convenient.

---

## 9. Script reference

| Script | Purpose |
|---|---|
| `deploy/deploy.sh` | Runs ON the VPS. Pulls + builds + reloads PM2. The "normal" deploy. |
| `deploy/nginx.conf` | Reference nginx vhost (the one actually used lives in `/etc/nginx/sites-available/onpay.id` on the VPS). |
| `deploy/_recover_and_deploy.py` | Full VPS bootstrap + first deploy. Idempotent, safe to rerun. |
| `deploy/_certbot_webroot.py` | Issue / renew Let's Encrypt cert via webroot mode + write the HTTPS vhost. |
| `deploy/_probe.py` | Read-only VPS state check — what's running, what's listening, user/repo/nginx state. |
| `deploy/_diag.py` | Runtime diagnostic of the PM2 process + standalone bundle. |
| `ecosystem.config.cjs` | PM2 app definition. `PORT=3456` is hard-coded. |
