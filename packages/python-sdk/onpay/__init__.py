"""
OnPay Python SDK -- Solana payment gateway integration.

Quick start::

    from onpay import OnPay, Webhook, OnPayError

    client = OnPay(secret_key="sk_live_...")
    invoice = client.invoices.create(amount_decimal="10.00", label="Coffee")
"""

from onpay.client import OnPay
from onpay.errors import OnPayError, WebhookSignatureError
from onpay.webhook import Webhook

__all__ = [
    "OnPay",
    "OnPayError",
    "Webhook",
    "WebhookSignatureError",
]

__version__ = "0.1.0"
