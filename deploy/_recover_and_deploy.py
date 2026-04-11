#!/usr/bin/env python
"""
OnPay VPS recovery + deploy.

Replaces the earlier _bootstrap.py which assumed a blank VPS. The real
VPS is a WordOps host with existing production sites:
  - sla-development.myskillset.me
  - soft-render.myskillset.me

Strategy:
  1. REPAIR nginx state that was accidentally broken by an earlier
     upstream nginx install: remove upstream nginx + nginx-full, purge
     python3-certbot-nginx (WordOps uses a different path), reinstall
     WordOps's nginx-custom so the existing sites come back online.
  2. Create a `deploy` user with sudo + install the local SSH key. Do
     NOT harden SSH or enable UFW — this box hosts other projects and
     an overzealous lockdown would break Wira's workflow.
  3. Create the onpay Postgres role + database on the already-running
     Postgres 16 instance.
  4. Clone the OnPay repo as the deploy user, write .env.production,
     install, migrate, build (standalone), start via PM2 on 127.0.0.1:3000.
  5. Use WordOps to create the onpay.id site as a reverse proxy to the
     local Node process with automatic Let's Encrypt provisioning:
        wo site create onpay.id --proxy=[127.0.0.1:3000] -le
"""
from __future__ import annotations

import base64
import json
import os
import secrets
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
except AttributeError:
    pass


VPS_HOST = "76.13.23.29"
DOMAIN = "onpay.id"
DEPLOY_USER = "deploy"
REPO_URL = "https://github.com/me-workspace/onpay_solana.git"
REPO_DIR = f"/home/{DEPLOY_USER}/onpay_solana"
PUB_KEY_PATH = Path.home() / ".ssh" / "onpay_vps_ed25519.pub"
PRIV_KEY_PATH = Path.home() / ".ssh" / "onpay_vps_ed25519"


@dataclass
class Secrets:
    jwt_secret: str
    cron_secret: str
    db_password: str

    @classmethod
    def generate(cls) -> "Secrets":
        return cls(
            jwt_secret=base64.b64encode(secrets.token_bytes(48)).decode("ascii"),
            cron_secret=base64.b64encode(secrets.token_bytes(24)).decode("ascii"),
            db_password=base64.urlsafe_b64encode(secrets.token_bytes(18))
            .decode("ascii")
            .rstrip("="),
        )


def safe_print(text: str) -> None:
    try:
        sys.stdout.write(text)
        sys.stdout.flush()
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or "ascii"
        sys.stdout.write(text.encode(enc, errors="replace").decode(enc))
        sys.stdout.flush()


def log(msg: str) -> None:
    safe_print(f"\033[1;36m==>\033[0m {msg}\n")


def die(msg: str) -> None:
    safe_print(f"\033[1;31mFAIL\033[0m {msg}\n")
    sys.exit(2)


def run(
    client: paramiko.SSHClient,
    cmd: str,
    *,
    check: bool = True,
    timeout: int = 600,
) -> int:
    _, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=timeout)
    for line in iter(stdout.readline, ""):
        safe_print(line)
    for line in iter(stderr.readline, ""):
        safe_print(f"\033[2m{line}\033[0m")
    rc = stdout.channel.recv_exit_status()
    if check and rc != 0:
        die(f"command failed (exit {rc}): {cmd[:120]}")
    return rc


def connect_root(password: str) -> paramiko.SSHClient:
    log(f"SSH root@{VPS_HOST} (password)")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        VPS_HOST,
        username="root",
        password=password,
        timeout=20,
        allow_agent=False,
        look_for_keys=False,
    )
    return client


def connect_deploy() -> paramiko.SSHClient:
    log(f"SSH {DEPLOY_USER}@{VPS_HOST} (key)")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.Ed25519Key.from_private_key_file(str(PRIV_KEY_PATH))
    client.connect(
        VPS_HOST,
        username=DEPLOY_USER,
        pkey=key,
        timeout=20,
        allow_agent=False,
        look_for_keys=False,
    )
    return client


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------


def phase_repair_nginx(client: paramiko.SSHClient) -> None:
    log("PHASE 0 — repair nginx (restore WordOps)")

    # 1. Kick out upstream nginx packages.
    run(
        client,
        "export DEBIAN_FRONTEND=noninteractive && "
        "apt-get remove --purge -y nginx nginx-full python3-certbot-nginx || true",
    )

    # 2. Reinstall WordOps's nginx-custom. WordOps keeps its own apt repo
    #    under /etc/apt/sources.list.d/wo-repo.list which already added
    #    the PPA. nginx-custom is the package WordOps controls.
    run(
        client,
        "DEBIAN_FRONTEND=noninteractive apt-get update -y && "
        "DEBIAN_FRONTEND=noninteractive apt-get install -y nginx-custom",
    )

    # 3. Verify and start.
    run(client, "nginx -t && systemctl enable --now nginx && systemctl is-active nginx")

    # 4. Sanity-check: the existing sites should now be serving again.
    run(
        client,
        "curl -sS -o /dev/null -w 'soft-render: HTTP %{http_code}\\n' "
        "https://soft-render.myskillset.me/ || true",
    )


def phase_create_deploy_user(client: paramiko.SSHClient, pubkey: str) -> None:
    log("PHASE 1 — create deploy user")
    run(
        client,
        f"id {DEPLOY_USER} >/dev/null 2>&1 || "
        f"(useradd --create-home --shell /bin/bash {DEPLOY_USER} && "
        f"usermod -aG sudo {DEPLOY_USER} && "
        f"echo '{DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/{DEPLOY_USER} && "
        f"chmod 440 /etc/sudoers.d/{DEPLOY_USER})",
    )
    run(
        client,
        f"mkdir -p /home/{DEPLOY_USER}/.ssh && "
        f"chmod 700 /home/{DEPLOY_USER}/.ssh && "
        f"echo '{pubkey}' > /home/{DEPLOY_USER}/.ssh/authorized_keys && "
        f"chmod 600 /home/{DEPLOY_USER}/.ssh/authorized_keys && "
        f"chown -R {DEPLOY_USER}:{DEPLOY_USER} /home/{DEPLOY_USER}/.ssh",
    )
    # Add deploy to www-data group so Nginx can read the .next/standalone files
    # if we ever choose to serve statics directly (defensive).
    run(client, f"usermod -aG www-data {DEPLOY_USER} || true")

    # Configure PM2 startup for the deploy user.
    run(
        client,
        f"env PATH=$PATH:/usr/bin pm2 startup systemd -u {DEPLOY_USER} --hp /home/{DEPLOY_USER}",
    )


def phase_create_postgres(client: paramiko.SSHClient, db_password: str) -> None:
    log("PHASE 2 — postgres role + database")
    # Idempotent creation: check before create. PostgreSQL 15+ also needs
    # GRANT ALL ON SCHEMA public because default privs changed.
    run(
        client,
        f'sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname=\'onpay\'" '
        f'| grep -q 1 || sudo -u postgres psql -c '
        f'"CREATE USER onpay WITH PASSWORD \'{db_password}\'"',
    )
    run(
        client,
        'sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname=\'onpay\'" '
        '| grep -q 1 || sudo -u postgres createdb -O onpay onpay',
    )
    run(
        client,
        'sudo -u postgres psql -d onpay -c '
        '"GRANT ALL ON SCHEMA public TO onpay; ALTER SCHEMA public OWNER TO onpay;"',
    )

    # Rotate the password in case the role already existed from a prior run.
    run(
        client,
        f'sudo -u postgres psql -c "ALTER USER onpay WITH PASSWORD \'{db_password}\'"',
    )


def phase_deploy_app(client: paramiko.SSHClient, env_content: str) -> None:
    log("PHASE 3 — deploy app as deploy user")

    run(
        client,
        f"if [ -d {REPO_DIR}/.git ]; then "
        f"  cd {REPO_DIR} && git fetch --quiet && git reset --hard origin/main; "
        f"else "
        f"  git clone {REPO_URL} {REPO_DIR}; "
        f"fi",
    )

    # Drop .env.production + .env.local (the latter for drizzle-kit).
    sftp = client.open_sftp()
    for name in (".env.production", ".env.local"):
        p = f"{REPO_DIR}/{name}"
        with sftp.file(p, "w") as f:
            f.write(env_content)
        sftp.chmod(p, 0o600)
        log(f"wrote {p}")
    sftp.close()

    run(client, f"cd {REPO_DIR} && npm ci --no-audit --no-fund")
    run(client, f"cd {REPO_DIR} && npm run db:migrate")
    run(client, f"cd {REPO_DIR} && NODE_ENV=production npm run build")

    # Copy static assets into the standalone bundle.
    run(
        client,
        f"cd {REPO_DIR} && "
        f"rm -rf .next/standalone/.next/static && "
        f"cp -R .next/static .next/standalone/.next/static && "
        f"if [ -d public ]; then rm -rf .next/standalone/public && cp -R public .next/standalone/public; fi",
    )

    # Load env into current shell and start/reload PM2.
    run(
        client,
        f"cd {REPO_DIR} && "
        "set -a && . ./.env.production && set +a && "
        "(pm2 describe onpay >/dev/null 2>&1 && "
        " pm2 reload ecosystem.config.cjs --update-env || "
        " pm2 start ecosystem.config.cjs) && "
        "pm2 save",
    )

    # Wait a beat for the app to bind.
    time.sleep(3)
    run(client, "curl -fsS http://127.0.0.1:3000/api/health")


def phase_wordops_site(client: paramiko.SSHClient) -> None:
    log("PHASE 4 — create WordOps reverse-proxy site for onpay.id")

    # WordOps's `wo site create ... --proxy=[host:port]` generates the
    # nginx vhost + grabs a Let's Encrypt cert in one shot.
    # If the site already exists (re-run), this will fail fast — we
    # handle that by checking first.
    run(
        client,
        f"wo site info {DOMAIN} >/dev/null 2>&1 && echo 'site exists, skipping create' || "
        f"wo site create {DOMAIN} --proxy=[127.0.0.1:3000] -le",
    )

    # Force reload nginx regardless.
    run(client, "nginx -t && systemctl reload nginx")


def phase_health_check(client: paramiko.SSHClient) -> None:
    log("PHASE 5 — external health check")
    time.sleep(2)
    run(
        client,
        f"curl -fsSL https://{DOMAIN}/api/health && echo '' && echo 'DONE'",
        check=False,
    )
    run(client, "pm2 status")


def render_env(secrets_: Secrets) -> str:
    return "\n".join(
        [
            "NODE_ENV=production",
            "NEXT_PUBLIC_SOLANA_CLUSTER=devnet",
            f"NEXT_PUBLIC_APP_URL=https://{DOMAIN}",
            f"DATABASE_URL=postgres://onpay:{secrets_.db_password}@127.0.0.1:5432/onpay",
            "DATABASE_POOL_MAX=20",
            "SOLANA_RPC_URL=https://api.devnet.solana.com",
            "SOLANA_RPC_FALLBACK_URL=",
            "JUPITER_API_URL=https://quote-api.jup.ag/v6",
            "JUPITER_MAX_SLIPPAGE_BPS=100",
            "DEFAULT_SETTLEMENT_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            f"JWT_SECRET={secrets_.jwt_secret}",
            "SESSION_TTL_SECONDS=86400",
            f"CRON_SECRET={secrets_.cron_secret}",
            "LOG_LEVEL=info",
            "INVOICE_TTL_SECONDS=600",
            "",
        ]
    )


def main() -> int:
    password = os.environ.get("VPS_ROOT_PASSWORD")
    if not password:
        die("Set VPS_ROOT_PASSWORD")

    if not PUB_KEY_PATH.exists():
        die(f"Missing public key at {PUB_KEY_PATH}")

    pubkey = PUB_KEY_PATH.read_text().strip()

    # Reuse existing secrets if we already generated them; otherwise generate.
    backup_path = Path.home() / ".ssh" / "onpay_vps_secrets.json"
    if backup_path.exists():
        data = json.loads(backup_path.read_text())
        gen_secrets = Secrets(
            jwt_secret=data["jwt_secret"],
            cron_secret=data["cron_secret"],
            db_password=data["db_password"],
        )
        log(f"reusing existing secrets from {backup_path}")
    else:
        gen_secrets = Secrets.generate()
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        backup_path.write_text(
            json.dumps(
                {
                    "jwt_secret": gen_secrets.jwt_secret,
                    "cron_secret": gen_secrets.cron_secret,
                    "db_password": gen_secrets.db_password,
                    "database_url": f"postgres://onpay:{gen_secrets.db_password}@127.0.0.1:5432/onpay",
                },
                indent=2,
            )
        )
        backup_path.chmod(0o600)
        log(f"saved new secrets to {backup_path}")

    env_content = render_env(gen_secrets)

    # ROOT phases: repair nginx, create deploy user, create postgres db.
    root_client = connect_root(password)
    try:
        phase_repair_nginx(root_client)
        phase_create_deploy_user(root_client, pubkey)
        phase_create_postgres(root_client, gen_secrets.db_password)
    finally:
        root_client.close()

    log("waiting 2s before switching users")
    time.sleep(2)

    # DEPLOY phase: app code as the deploy user.
    deploy_client = connect_deploy()
    try:
        phase_deploy_app(deploy_client, env_content)
    finally:
        deploy_client.close()

    # Back to ROOT for the WordOps site create (requires root).
    root_client = connect_root(password)
    try:
        phase_wordops_site(root_client)
        phase_health_check(root_client)
    finally:
        root_client.close()

    log("deployment complete ✨")
    log(f"visit https://{DOMAIN}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
