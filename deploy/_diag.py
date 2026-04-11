#!/usr/bin/env python
"""Quick diagnostic SSH session as deploy user — check the running app."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
except AttributeError:
    pass

HOST = "76.13.23.29"
KEY = Path.home() / ".ssh" / "onpay_vps_ed25519"


def run(client, label, cmd):
    print(f"\n== {label} ==")
    _, stdout, _ = client.exec_command(cmd, get_pty=False, timeout=60)
    for line in iter(stdout.readline, ""):
        try:
            sys.stdout.write(line)
        except UnicodeEncodeError:
            sys.stdout.write(line.encode("ascii", errors="replace").decode("ascii"))
    stdout.channel.recv_exit_status()
    sys.stdout.flush()


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="deploy", pkey=paramiko.Ed25519Key.from_private_key_file(str(KEY)))

    run(client, "pm2 status", "pm2 jlist | python3 -c \"import json,sys; d=json.load(sys.stdin); [print(p['name'], p['pm2_env']['status'], p['pid']) for p in d]\" 2>&1 || pm2 status")
    run(client, "pm2 recent logs", "pm2 logs onpay --lines 20 --nostream --raw 2>&1 | tail -40")
    run(client, "port 3000", "ss -tln | grep :3000 || echo 'nothing on 3000'")
    run(client, "curl /api/health direct", "curl -sv http://127.0.0.1:3000/api/health 2>&1 | head -40")
    run(client, "curl / direct", "curl -sv http://127.0.0.1:3000/ 2>&1 | head -20")
    run(client, "standalone structure", "ls -la /home/deploy/onpay_solana/.next/standalone/ 2>&1")
    run(client, "standalone .next subdirs", "find /home/deploy/onpay_solana/.next/standalone/.next -type d 2>&1 | head -20")
    run(client, "server.js path", "ls -la /home/deploy/onpay_solana/.next/standalone/server.js 2>&1")
    run(client, "api routes present", "find /home/deploy/onpay_solana/.next/standalone/.next/server/app/api -type f 2>&1 | head -20")
    run(client, "ecosystem config used", "cat /home/deploy/onpay_solana/ecosystem.config.cjs")

    client.close()


if __name__ == "__main__":
    main()
