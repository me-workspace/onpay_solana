"""
OnPay Python SDK client.

Provides a high-level interface to the OnPay REST API using sub-resource
accessors (``client.invoices``, ``client.merchants``, ``client.webhook_endpoints``).

Usage::

    from onpay import OnPay

    client = OnPay(secret_key="sk_live_...", base_url="https://onpay.id")

    invoice = client.invoices.create(
        amount_decimal="10.00",
        currency="USD",
        label="Coffee",
    )
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from onpay.errors import OnPayError
from onpay.types import (
    Invoice,
    InvoiceList,
    Merchant,
    WebhookDeleteResponse,
    WebhookEndpoint,
    WebhookEndpointList,
    WebhookEndpointWithSecret,
)

#: API version sent with every request.
API_VERSION = "2026-04-12"

#: Default base URL for the OnPay API.
DEFAULT_BASE_URL = "https://onpay.id"

#: HTTP request timeout in seconds.
DEFAULT_TIMEOUT = 30.0


class _BaseResource:
    """Shared base for API sub-resources."""

    def __init__(self, client: OnPay) -> None:
        self._client = client

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        """Send an HTTP request through the parent client.

        Args:
            method: HTTP method (GET, POST, DELETE).
            path: URL path relative to the base URL (e.g. ``/api/invoices``).
            json_body: Optional JSON request body for POST requests.
            params: Optional query parameters.
            idempotency_key: Optional idempotency key for POST requests.

        Returns:
            Parsed JSON response body.

        Raises:
            OnPayError: On non-2xx responses.
        """
        return self._client._request(
            method,
            path,
            json_body=json_body,
            params=params,
            idempotency_key=idempotency_key,
        )


class Invoices(_BaseResource):
    """Invoice operations (``client.invoices``)."""

    def create(
        self,
        amount_decimal: str,
        currency: str = "USD",
        label: Optional[str] = None,
        memo: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Invoice:
        """Create a new invoice.

        Args:
            amount_decimal: Amount as a decimal string, e.g. ``"10.00"``.
            currency: ISO currency code. Defaults to ``"USD"``.
            label: Optional short label shown to the payer.
            memo: Optional memo/description.
            idempotency_key: Optional key to prevent duplicate creation.

        Returns:
            The created invoice.
        """
        body: Dict[str, Any] = {
            "amountDecimal": amount_decimal,
            "currency": currency,
        }
        if label is not None:
            body["label"] = label
        if memo is not None:
            body["memo"] = memo

        return self._request(
            "POST",
            "/api/invoices",
            json_body=body,
            idempotency_key=idempotency_key,
        )  # type: ignore[return-value]

    def retrieve(self, invoice_id: str) -> Invoice:
        """Retrieve a single invoice by ID.

        Args:
            invoice_id: UUID of the invoice.

        Returns:
            The invoice.
        """
        return self._request("GET", f"/api/invoices/{invoice_id}")  # type: ignore[return-value]

    def list(
        self,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> InvoiceList:
        """List invoices for the authenticated merchant.

        Args:
            status: Filter by status (``pending``, ``paid``, ``expired``, ``failed``).
            limit: Maximum number of results (1--100, default 20).
            offset: Number of results to skip (default 0).

        Returns:
            Dictionary with ``invoices`` list, ``limit``, and ``offset``.
        """
        params: Dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset

        return self._request("GET", "/api/invoices", params=params)  # type: ignore[return-value]


class Merchants(_BaseResource):
    """Merchant profile operations (``client.merchants``)."""

    def retrieve(self) -> Merchant:
        """Retrieve the authenticated merchant's profile.

        Returns:
            The merchant profile.
        """
        return self._request("GET", "/api/merchants")  # type: ignore[return-value]

    def update(
        self,
        business_name: Optional[str] = None,
        settlement_mint: Optional[str] = None,
        preferred_language: Optional[str] = None,
    ) -> Merchant:
        """Update (upsert) the authenticated merchant's profile.

        Args:
            business_name: Display name for the business.
            settlement_mint: Solana mint address for settlement token.
            preferred_language: Language preference (``en`` or ``id``).

        Returns:
            The updated merchant profile.
        """
        body: Dict[str, Any] = {}
        if business_name is not None:
            body["businessName"] = business_name
        if settlement_mint is not None:
            body["settlementMint"] = settlement_mint
        if preferred_language is not None:
            body["preferredLanguage"] = preferred_language

        return self._request("POST", "/api/merchants", json_body=body)  # type: ignore[return-value]


class WebhookEndpoints(_BaseResource):
    """Webhook endpoint operations (``client.webhook_endpoints``)."""

    def create(
        self,
        url: str,
        events: List[str],
        idempotency_key: Optional[str] = None,
    ) -> WebhookEndpointWithSecret:
        """Create a new webhook endpoint.

        The signing secret is included in the response and cannot be
        retrieved again. Store it securely.

        Args:
            url: HTTPS URL to receive webhook deliveries.
            events: List of event types to subscribe to. Valid values:
                ``invoice.paid``, ``invoice.expired``, ``invoice.failed``.
            idempotency_key: Optional key to prevent duplicate creation.

        Returns:
            The created endpoint including the one-time signing secret.
        """
        return self._request(
            "POST",
            "/api/webhooks",
            json_body={"url": url, "events": events},
            idempotency_key=idempotency_key,
        )  # type: ignore[return-value]

    def list(self) -> WebhookEndpointList:
        """List all webhook endpoints for the authenticated merchant.

        Returns:
            Dictionary with ``endpoints`` list.
        """
        return self._request("GET", "/api/webhooks")  # type: ignore[return-value]

    def delete(self, endpoint_id: str) -> WebhookDeleteResponse:
        """Delete a webhook endpoint.

        This is a hard delete that also removes all delivery history.

        Args:
            endpoint_id: UUID of the webhook endpoint to delete.

        Returns:
            Confirmation with ``ok`` and ``id``.
        """
        return self._request("DELETE", f"/api/webhooks/{endpoint_id}")  # type: ignore[return-value]


class OnPay:
    """OnPay API client.

    Args:
        secret_key: Your OnPay secret API key (``sk_live_...`` or ``sk_test_...``).
        base_url: Base URL of the OnPay API. Defaults to ``https://onpay.id``.
        timeout: HTTP request timeout in seconds. Defaults to 30.
    """

    def __init__(
        self,
        secret_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        if not secret_key:
            raise ValueError("secret_key is required")

        self._secret_key = secret_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

        self._http = httpx.Client(
            base_url=self._base_url,
            timeout=self._timeout,
            headers={
                "Authorization": f"Bearer {self._secret_key}",
                "OnPay-Version": API_VERSION,
                "User-Agent": "onpay-python/0.1.0",
            },
        )

        # Sub-resource accessors.
        self.invoices = Invoices(self)
        self.merchants = Merchants(self)
        self.webhook_endpoints = WebhookEndpoints(self)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        """Send an HTTP request and handle errors.

        Args:
            method: HTTP method.
            path: URL path.
            json_body: Optional JSON body.
            params: Optional query parameters.
            idempotency_key: Optional idempotency key header.

        Returns:
            Parsed JSON response.

        Raises:
            OnPayError: On non-2xx responses.
        """
        headers: Dict[str, str] = {}
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key

        response = self._http.request(
            method,
            path,
            json=json_body,
            params=params,
            headers=headers,
        )

        if response.status_code >= 400:
            self._handle_error(response)

        return response.json()

    @staticmethod
    def _handle_error(response: httpx.Response) -> None:
        """Parse an error response and raise ``OnPayError``.

        Tries to extract the structured error body (``code``, ``message``,
        ``details``). Falls back to generic values if the body is not JSON.
        """
        try:
            body = response.json()
            code = body.get("code", "UNKNOWN_ERROR")
            message = body.get("message", response.text)
            details = body.get("details")
        except Exception:
            code = "UNKNOWN_ERROR"
            message = response.text or f"HTTP {response.status_code}"
            details = None

        raise OnPayError(
            status_code=response.status_code,
            code=code,
            message=message,
            details=details,
        )

    def close(self) -> None:
        """Close the underlying HTTP client and release resources."""
        self._http.close()

    def __enter__(self) -> OnPay:
        """Support usage as a context manager."""
        return self

    def __exit__(self, *args: Any) -> None:
        """Close the client on context manager exit."""
        self.close()
