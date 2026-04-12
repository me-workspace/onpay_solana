"""
OnPay SDK error types.

All API errors are raised as ``OnPayError`` with structured fields matching
the server's ``ApiErrorBody`` shape (code, message, details).

Webhook verification failures raise ``WebhookSignatureError``.
"""

from __future__ import annotations

from typing import Any, Optional


class OnPayError(Exception):
    """Raised when the OnPay API returns a non-2xx response.

    Attributes:
        status_code: HTTP status code from the response.
        code: Machine-readable error code (e.g. ``INVALID_REQUEST``).
        message: Human-readable error description.
        details: Optional structured validation details.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Any] = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(f"[{status_code}] {code}: {message}")


class WebhookSignatureError(OnPayError):
    """Raised when webhook signature verification fails.

    This is a subclass of ``OnPayError`` so callers can catch either
    specifically or broadly.
    """

    def __init__(self, message: str) -> None:
        super().__init__(
            status_code=400,
            code="WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
            message=message,
        )
