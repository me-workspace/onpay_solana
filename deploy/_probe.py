#!/usr/bin/env python
"""Diagnostic probe for the VPS. Reports current system state."""
from __future__ import annotations

import os
import sys

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
except AttributeError:
    pass


HOST = "76.13.23.29"


def safe_print(text: str) -> None:
    try:
        sys.stdout.write(text)
        sys.stdout.flush()
    except UnicodeEncodeError:
        encoding = sys.stdout.encoding or "ascii"
        sys.stdout.write(text.encode(encoding, errors="replace").decode(encoding))
        sys.stdout.flush()


def run(client: paramiko.SSHClient, label: str, cmd: str) -> None:
    safe_print(f"\n\033[1;36m== {label} ==\033[0m\n")
    _, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=60)
    for line in iter(stdout.readline, ""):
        safe_print(line)
    for line in iter(stderr.readline, ""):
        safe_print(f"\033[2m{line}\033[0m")
    rc = stdout.channel.recv_exit_status()
    safe_print(f"\033[2m(exit {rc})\033[0m\n")


def try_connect_root(password: str) -> paramiko.SSHClient | None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            HOST,
            username="root",
            password=password,
            timeout=10,
            allow_agent=False,
            look_for_keys=False,
        )
        safe_print(f"connected as root@{HOST} (password)\n")
        return client
    except Exception as e:
        safe_print(f"root password auth failed: {type(e).__name__}: {e}\n")
        try:
            client.close()
        except Exception:
            pass
        return None


def try_connect_deploy() -> paramiko.SSHClient | None:
    key_path = os.path.expanduser("~/.ssh/onpay_vps_ed25519")
    if not os.path.exists(key_path):
        safe_print(f"no key at {key_path}\n")
        return None
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        key = paramiko.Ed25519Key.from_private_key_file(key_path)
        client.connect(
            HOST,
            username="deploy",
            pkey=key,
            timeout=10,
            allow_agent=False,
            look_for_keys=False,
        )
        safe_print(f"connected as deploy@{HOST} (key)\n")
        return client
    except Exception as e:
        safe_print(f"deploy key auth failed: {type(e).__name__}: {e}\n")
        try:
            client.close()
        except Exception:
            pass
        return None


def main() -> int:
    password = os.environ.get("VPS_ROOT_PASSWORD")

    # Try root password first (original state), then deploy key (post-bootstrap).
    client = None
    user = None
    if password:
        client = try_connect_root(password)
        if client is not None:
            user = "root"
    if client is None:
        client = try_connect_deploy()
        if client is not None:
            user = "deploy"
    if client is None:
        safe_print("Both auth methods failed. Cannot continue.\n")
        return 2

    prefix = "sudo " if user != "root" else ""

    run(client, "uname + release", "uname -a; cat /etc/os-release | head -5")
    run(client, "what's on port 80/443", f"{prefix}ss -tulpn | grep -E ':(80|443)\\b' || echo 'nothing'")
    run(client, "nginx status", f"{prefix}systemctl status nginx --no-pager 2>&1 | head -30 || true")
    run(client, "nginx config test", f"{prefix}nginx -t 2>&1 || true")
    run(client, "nginx sites-enabled", f"{prefix}ls -la /etc/nginx/sites-enabled/ 2>&1 || true")
    run(
        client,
        "nginx configs in sites-enabled",
        f"for f in /etc/nginx/sites-enabled/*; do echo \"--- $f ---\"; {prefix}head -20 \"$f\" 2>&1; done || true",
    )
    run(client, "half-installed packages", f"{prefix}dpkg -l | grep -E '^i[^i]' | head -10 || echo none")
    run(client, "apache2?", f"{prefix}systemctl is-active apache2 2>&1 || true")
    run(
        client,
        "running web services",
        f"{prefix}systemctl list-units --type=service --state=running 2>&1 | grep -iE 'nginx|apache|caddy|httpd|wordops|openlite|lsws' || echo none",
    )
    run(client, "postgresql", f"{prefix}systemctl is-active postgresql 2>&1 || true")
    run(client, "node", "command -v node && node -v 2>&1 || echo 'not installed'")
    run(client, "pm2", "command -v pm2 && pm2 -v 2>&1 || echo 'not installed'")
    run(client, "deploy user", "getent passwd deploy 2>&1 || echo 'no deploy user'")
    run(client, "deploy ssh keys", f"{prefix}cat /home/deploy/.ssh/authorized_keys 2>&1 || echo 'missing'")
    run(client, "onpay repo", "ls -la /home/deploy/onpay_solana 2>&1 || echo 'not cloned'")
    run(client, "ufw", f"{prefix}ufw status 2>&1 || true")

    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
