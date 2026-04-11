#!/usr/bin/env python
"""SSH to the VPS as the deploy user and run the deploy script."""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
except AttributeError:
    pass

HOST = "76.13.23.29"
KEY = Path.home() / ".ssh" / "onpay_vps_ed25519"


def safe_print(text: str) -> None:
    try:
        sys.stdout.write(text)
        sys.stdout.flush()
    except UnicodeEncodeError:
        sys.stdout.write(text.encode("ascii", errors="replace").decode("ascii"))
        sys.stdout.flush()


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username="deploy",
        pkey=paramiko.Ed25519Key.from_private_key_file(str(KEY)),
        allow_agent=False,
        look_for_keys=False,
    )

    safe_print("\n\033[1;36m== remote deploy ==\033[0m\n")
    # Hard-reset the working tree to origin/main before running the deploy
    # script — the VPS can accumulate stale diffs from manual bootstrap
    # edits (port swap, chmod) that were later committed upstream.
    _, stdout, stderr = client.exec_command(
        "cd /home/deploy/onpay_solana && "
        "git fetch --quiet && "
        "git reset --hard origin/main && "
        "chmod +x deploy/deploy.sh && "
        "bash deploy/deploy.sh 2>&1",
        get_pty=True,
        timeout=1200,
    )
    for line in iter(stdout.readline, ""):
        safe_print(line)
    rc = stdout.channel.recv_exit_status()
    safe_print(f"\n\033[2m(exit {rc})\033[0m\n")

    client.close()
    return rc


if __name__ == "__main__":
    sys.exit(main())
