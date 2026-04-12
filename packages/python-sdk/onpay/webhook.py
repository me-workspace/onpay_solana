"""
Webhook signature verification for OnPay webhook events.

Implements Stripe-compatible HMAC-SHA256 verification. The ``OnPay-Signature``
header has the format ``t=<unix_timestamp>,v1=<hex_signature>``.

Usage::

    from onpay import Webhook

    event = Webhook.construct_event(
        payload=request.body,
        sig_header=request.headers["OnPay-Signature"],
        secret="whsec_...",
        tolerance=300,
    )
"""

from __future__ import annotations

import hmac
import hashlib
import json
import time
from typing import Any, Dict, Optional

from onpay.errors import WebhookSignatureError


class Webhook:
    """Static helper for verifying OnPay webhook signatures."""

    @staticmethod
    def construct_event(
        payload: bytes | str,
        sig_header: str,
        secret: str,
        tolerance: int = 300,
    ) -> Dict[str, Any]:
        """Verify a webhook signature and return the parsed event payload.

        Args:
            payload: Raw request body (bytes or string).
            sig_header: Value of the ``OnPay-Signature`` header.
            secret: Webhook signing secret (hex-encoded).
            tolerance: Maximum age of the signature in seconds. Defaults to
                300 (5 minutes). Set to ``0`` to disable timestamp checking.

        Returns:
            Parsed JSON payload as a dictionary.

        Raises:
            WebhookSignatureError: If the signature is missing, invalid,
                or the timestamp is outside the tolerance window.
        """
        Webhook._verify_signature(payload, sig_header, secret, tolerance)

        body_str = payload if isinstance(payload, str) else payload.decode("utf-8")
        try:
            return json.loads(body_str)  # type: ignore[no-any-return]
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise WebhookSignatureError(
                f"Failed to parse webhook payload as JSON: {exc}"
            ) from exc

    @staticmethod
    def verify_header(
        payload: bytes | str,
        sig_header: str,
        secret: str,
        tolerance: int = 300,
    ) -> bool:
        """Verify the webhook signature without parsing the payload.

        Same parameters and behaviour as ``construct_event`` but returns
        ``True`` on success instead of the parsed body.

        Raises:
            WebhookSignatureError: On verification failure.
        """
        Webhook._verify_signature(payload, sig_header, secret, tolerance)
        return True

    @staticmethod
    def _verify_signature(
        payload: bytes | str,
        sig_header: str,
        secret: str,
        tolerance: int,
    ) -> None:
        """Core verification logic.

        Raises ``WebhookSignatureError`` on any failure.
        """
        if not sig_header:
            raise WebhookSignatureError("Missing OnPay-Signature header")

        # Parse header: t=<timestamp>,v1=<signature>
        timestamp: Optional[str] = None
        signature: Optional[str] = None

        for part in sig_header.split(","):
            key_value = part.strip().split("=", 1)
            if len(key_value) != 2:
                continue
            key, value = key_value
            if key == "t":
                timestamp = value
            elif key == "v1":
                signature = value

        if timestamp is None:
            raise WebhookSignatureError(
                "Invalid OnPay-Signature header: missing timestamp (t=...)"
            )
        if signature is None:
            raise WebhookSignatureError(
                "Invalid OnPay-Signature header: missing signature (v1=...)"
            )

        # Validate timestamp is a number.
        try:
            ts_int = int(timestamp)
        except ValueError as exc:
            raise WebhookSignatureError(
                f"Invalid timestamp in OnPay-Signature header: {timestamp}"
            ) from exc

        # Check timestamp tolerance (replay protection).
        if tolerance > 0:
            now = int(time.time())
            if abs(now - ts_int) > tolerance:
                raise WebhookSignatureError(
                    f"Webhook timestamp too old or too far in the future. "
                    f"Timestamp: {ts_int}, current time: {now}, "
                    f"tolerance: {tolerance}s"
                )

        # Compute expected signature: HMAC-SHA256(secret, "{timestamp}.{body}")
        body_str = payload if isinstance(payload, str) else payload.decode("utf-8")
        signed_payload = f"{timestamp}.{body_str}"
        expected = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Constant-time comparison.
        if not hmac.compare_digest(expected, signature):
            raise WebhookSignatureError(
                "Webhook signature verification failed. The payload may have "
                "been tampered with, or the wrong signing secret was used."
            )
