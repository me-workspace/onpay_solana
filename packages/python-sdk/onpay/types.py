"""
TypedDict definitions for OnPay API response shapes.

These match the JSON structures returned by the OnPay REST API and
provide static type-checking without runtime overhead.
"""

from __future__ import annotations

import sys

if sys.version_info >= (3, 11):
    from typing import NotRequired, TypedDict
else:
    from typing import TypedDict

    try:
        from typing import NotRequired
    except ImportError:
        from typing_extensions import NotRequired


class InvoiceAmount(TypedDict):
    """Monetary amount embedded in an Invoice response."""

    raw: str
    """Raw decimal string, e.g. ``"10.00"``."""

    formatted: str
    """Human-friendly formatted string, e.g. ``"$10.00"``."""

    currency: str
    """ISO currency code, e.g. ``"USD"``."""

    decimals: int
    """Number of decimal places for this currency."""


class Invoice(TypedDict):
    """A single invoice as returned by the API."""

    id: str
    reference: str
    merchantId: str
    amount: InvoiceAmount
    label: str | None
    memo: str | None
    status: str
    """One of ``pending``, ``paid``, ``expired``, ``failed``."""

    expiresAt: str
    """ISO-8601 datetime string."""

    createdAt: str
    """ISO-8601 datetime string."""

    paymentUrl: str
    """Solana Pay URL for QR code rendering."""


class InvoiceList(TypedDict):
    """Response shape for ``GET /api/invoices``."""

    invoices: list[Invoice]
    limit: int
    offset: int


class Merchant(TypedDict):
    """Merchant profile as returned by the API."""

    id: str
    walletAddress: str
    businessName: str | None
    settlementMint: str
    preferredLanguage: str
    createdAt: str
    updatedAt: str


class WebhookEndpoint(TypedDict):
    """Webhook endpoint as returned by list operations."""

    id: str
    url: str
    events: list[str]
    enabled: bool
    createdAt: str


class WebhookEndpointWithSecret(TypedDict):
    """Webhook endpoint as returned on creation (includes one-time secret)."""

    id: str
    url: str
    events: list[str]
    enabled: bool
    createdAt: str
    secret: str
    """Signing secret -- only returned once on creation."""


class WebhookEndpointList(TypedDict):
    """Response shape for ``GET /api/webhooks``."""

    endpoints: list[WebhookEndpoint]


class WebhookDeleteResponse(TypedDict):
    """Response shape for ``DELETE /api/webhooks/[id]``."""

    ok: bool
    id: str


class WebhookDelivery(TypedDict):
    """A single webhook delivery attempt."""

    id: str
    eventType: str
    httpStatus: int | None
    responseBody: str | None
    attempts: int
    nextRetryAt: str | None
    deliveredAt: str | None
    createdAt: str


class WebhookDeliveryList(TypedDict):
    """Response shape for ``GET /api/webhooks/[id]/deliveries``."""

    deliveries: list[WebhookDelivery]
