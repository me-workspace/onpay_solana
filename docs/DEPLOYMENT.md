# OnPay — Hostinger VPS deployment

> Target: single Node 22 process behind Nginx + Let's Encrypt, supervised
> by PM2, backed by a managed Neon (or RDS) Postgres. Zero Vercel, zero
> serverless cold starts, full control.

This document is the canonical runbook for provisioning and updating the
production deployment. Follow it end-to-end the first time; after that,
deploys are a single `git push` that triggers the GitHub Actions workflow
in `.github/workflows/deploy.yml`.

---

## 1. Prerequisites

### On your laptop
- SSH key (`~/.ssh/id_ed25519` or similar) added to the Hostinger VPS's
  `~/.ssh/authorized_keys` for the `deploy` user (not root).
- `gh` CLI logged in (for setting GitHub secrets).

### VPS specs (one-time order from Hostinger)
- Ubuntu 24.04 LTS
- At least 2 vCPU, 4 GB RAM (OnPay + Node + Nginx fits comfortably; the
  Solana RPC calls are the memory spike)
- 40 GB SSD
- A public IPv4 address

### Domain
- A-record pointing at the VPS IP (`onpay.app` or whatever you registered)
- Optionally: `www.onpay.app` CNAME → `onpay.app`

### Managed Postgres
- Neon free tier is recommended — separates DB from app lifecycle
- Copy the connection string (keep `?sslmode=require`)
- Keep `DATABASE_POOL_MAX=20` for a long-lived server (vs `5` for serverless)

---

## 2. One-time VPS bootstrap

SSH in as root the first time Hostinger gives you the machine.

### 2.1 Create a non-root user
```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

### 2.2 Lock down SSH
```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
AllowUsers deploy
```
```bash
systemctl restart ssh
```

### 2.3 Firewall (UFW)
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2.4 Install Node 22, PM2, Nginx, Certbot
Log out and back in as `deploy`, then:
```bash
# Node 22 via nodesource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
pm2 startup systemd -u deploy --hp /home/deploy
# ^ PM2 will print a `sudo systemctl enable ...` command — run it.
```

### 2.5 Clone the repo as the deploy user
```bash
cd /home/deploy
git clone https://github.com/me-workspace/onpay_solana.git
cd onpay_solana
```

### 2.6 Create `.env.production` with the real values
```bash
sudo install -m 600 -o deploy -g deploy /dev/null /home/deploy/onpay_solana/.env.production
nano /home/deploy/onpay_solana/.env.production
```
Paste in the real production values (DATABASE_URL, SOLANA_RPC_URL,
JWT_SECRET, CRON_SECRET, etc.). See `.env.example` for the full schema.

**NEVER** commit this file — it's gitignored.

### 2.7 First build + first migration
```bash
cd /home/deploy/onpay_solana
npm ci
npm run db:migrate
npm run build
```

### 2.8 Start under PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### 2.9 Nginx reverse proxy
See `deploy/nginx.conf` in this repo. Copy it to `/etc/nginx/sites-available/onpay`,
symlink to `sites-enabled/`, test, reload:
```bash
sudo cp /home/deploy/onpay_solana/deploy/nginx.conf /etc/nginx/sites-available/onpay
sudo ln -s /etc/nginx/sites-available/onpay /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 2.10 HTTPS via Certbot
```bash
sudo certbot --nginx -d onpay.app -d www.onpay.app
```
Certbot auto-edits the Nginx config to redirect HTTP→HTTPS and sets up a
renewal timer.

### 2.11 Configure cron for expiration sweeper
As the `deploy` user:
```bash
crontab -e
```
Add:
```
* * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://onpay.app/api/cron/expire-invoices >> /home/deploy/onpay-cron.log 2>&1
```
(Replace `$CRON_SECRET` with the actual secret inline — cron doesn't expand env vars.)

---

## 3. Recurring deploys

### Option A: Manual
```bash
ssh deploy@onpay.app
cd onpay_solana
./deploy/deploy.sh
```

### Option B: GitHub Actions (recommended)
`.github/workflows/deploy.yml` runs on push to `main`:
1. SSH into the VPS using `DEPLOY_SSH_KEY` (GitHub secret)
2. Run `./deploy/deploy.sh` remotely

Set the required secrets once with `gh`:
```bash
gh secret set DEPLOY_HOST      # e.g. onpay.app
gh secret set DEPLOY_USER      # deploy
gh secret set DEPLOY_SSH_KEY   # contents of ~/.ssh/id_ed25519 that's authorized on the VPS
```

---

## 4. Rollback

PM2 keeps the previous process alive during reload, but if a deploy goes
bad and the new process crashes, roll back to the previous commit:
```bash
ssh deploy@onpay.app
cd onpay_solana
git log --oneline -5   # find the last known-good commit
git reset --hard <sha>
./deploy/deploy.sh
```

For DB migration rollbacks, drizzle-kit does not generate down migrations.
Roll back manually with SQL if needed, then update the schema in code.
**Test migrations on a staging DB before touching prod.**

---

## 5. Observability

- **App logs**: `pm2 logs onpay` or `tail -f ~/.pm2/logs/onpay-out.log`
- **Nginx access**: `sudo tail -f /var/log/nginx/access.log`
- **Nginx errors**: `sudo tail -f /var/log/nginx/error.log`
- **Cron output**: `tail -f /home/deploy/onpay-cron.log`
- **System health**: `GET https://onpay.app/api/health`

---

## 6. Known gotchas

1. **DATABASE_POOL_MAX** should be ~20 on the VPS (long-lived Node), NOT the
   default `5` which is tuned for serverless.
2. **PM2 and .env**: `ecosystem.config.cjs` loads `.env.production` at start
   time. If you change env vars, `pm2 reload onpay` to pick them up.
3. **Next.js standalone** copies only files referenced at build time. Any
   runtime-read file (e.g. a logo we didn't import) needs to be explicitly
   listed in `next.config.ts` `outputFileTracingIncludes`.
4. **Certbot renewals**: run `sudo certbot renew --dry-run` monthly to
   catch config drift before the 90-day cert expires.
5. **Solana RPC rate limits**: the default public RPC will 429 under demo
   load. Use Helius or Triton. Set `SOLANA_RPC_URL` to the paid endpoint,
   keep the public one as `SOLANA_RPC_FALLBACK_URL`.
