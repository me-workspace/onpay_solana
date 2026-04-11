#!/usr/bin/env python
"""
Provision Let's Encrypt cert via certbot webroot mode (no nginx plugin
required), then rewrite the onpay.id nginx vhost to serve HTTPS with
the new cert and redirect HTTP to HTTPS.
"""
from __future__ import annotations

import os
import sys
import time

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
except AttributeError:
    pass

HOST = "76.13.23.29"
DOMAIN = "onpay.id"
WWW_DOMAIN = "www.onpay.id"
APP_PORT = 3456


FINAL_VHOST = f"""# /etc/nginx/sites-available/{DOMAIN}
# OnPay Next.js reverse proxy — HTTPS on 443, HTTP->HTTPS redirect on 80.

# HTTP server — ACME challenge + redirect to HTTPS.
server {{
    listen 80;
    listen [::]:80;
    server_name {DOMAIN} {WWW_DOMAIN};

    # Let certbot webroot challenges still succeed during renewal.
    location /.well-known/acme-challenge/ {{
        root /var/www/html;
    }}

    location / {{
        return 301 https://$host$request_uri;
    }}
}}

# HTTPS server — reverse proxy to the Node process.
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name {DOMAIN} {WWW_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/{DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    # Do not declare ssl_session_cache / ssl_session_timeout here — WordOps
    # sets them globally in nginx.conf with a larger shared zone and
    # redefining them produces a "shared memory zone conflict" error.

    access_log /var/log/nginx/{DOMAIN}.access.log;
    error_log  /var/log/nginx/{DOMAIN}.error.log;

    client_max_body_size 64k;

    location / {{
        proxy_pass http://127.0.0.1:{APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }}

    location /_next/static/ {{
        proxy_pass http://127.0.0.1:{APP_PORT};
        add_header Cache-Control "public, max-age=31536000, immutable";
    }}

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    server_tokens off;
}}
"""


def safe_print(text: str) -> None:
    try:
        sys.stdout.write(text)
        sys.stdout.flush()
    except UnicodeEncodeError:
        sys.stdout.write(text.encode("ascii", errors="replace").decode("ascii"))
        sys.stdout.flush()


def run(client, label, cmd, check=True, timeout=600):
    safe_print(f"\n\033[1;36m== {label} ==\033[0m\n")
    _, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=timeout)
    for line in iter(stdout.readline, ""):
        safe_print(line)
    for line in iter(stderr.readline, ""):
        safe_print(f"\033[2m{line}\033[0m")
    rc = stdout.channel.recv_exit_status()
    if check and rc != 0:
        safe_print(f"\033[1;31mFAIL\033[0m (exit {rc}) {cmd[:120]}\n")
        sys.exit(2)
    return rc


def main():
    password = os.environ["VPS_ROOT_PASSWORD"]

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=password, allow_agent=False, look_for_keys=False)

    # 1. Make sure the webroot challenge directory exists and is accessible.
    run(
        client,
        "prepare /var/www/html for webroot challenges",
        "mkdir -p /var/www/html/.well-known/acme-challenge && "
        "chown -R www-data:www-data /var/www/html/.well-known",
    )

    # 2. Issue the cert via webroot mode (skipped if the cert already exists).
    run(
        client,
        "certbot certonly --webroot (idempotent)",
        f"if [ -f /etc/letsencrypt/live/{DOMAIN}/fullchain.pem ]; then "
        f"  echo 'cert already exists, skipping'; "
        f"else "
        f"  certbot certonly --webroot -w /var/www/html "
        f"  --non-interactive --agree-tos -m admin@{DOMAIN} "
        f"  -d {DOMAIN} -d {WWW_DOMAIN}; "
        f"fi",
    )

    # 3. Replace the HTTP-only vhost with the full HTTPS one.
    sftp = client.open_sftp()
    vhost_path = f"/etc/nginx/sites-available/{DOMAIN}"
    with sftp.file(vhost_path, "w") as f:
        f.write(FINAL_VHOST)
    sftp.close()
    safe_print(f"\n\033[1;32mWrote final vhost {vhost_path}\033[0m\n")

    # 4. Test + reload nginx.
    run(client, "nginx -t + reload", "nginx -t && systemctl reload nginx")

    # 5. Final verification.
    time.sleep(2)
    run(
        client,
        "curl https://onpay.id/",
        f"curl -sS -o /dev/null -w 'HTTP %{{http_code}}\\n' https://{DOMAIN}/",
        check=False,
    )
    run(
        client,
        "curl https://onpay.id/api/health",
        f"curl -fsS https://{DOMAIN}/api/health && echo",
        check=False,
    )
    run(
        client,
        "curl http://onpay.id (expect 301)",
        f"curl -sS -o /dev/null -w 'HTTP %{{http_code}}\\n' http://{DOMAIN}/",
        check=False,
    )
    run(
        client,
        "other sites still up",
        "curl -sS -o /dev/null -w 'soft-render: %{http_code}\\n' https://soft-render.myskillset.me/ && "
        "curl -sS -o /dev/null -w 'sla-development: %{http_code}\\n' https://sla-development.myskillset.me/ || true",
        check=False,
    )

    client.close()
    safe_print("\n\033[1;32m✨ https://onpay.id is live\033[0m\n")


if __name__ == "__main__":
    main()
