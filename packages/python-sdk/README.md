# OnPay Python SDK

Python SDK for the [OnPay](https://onpay.id) Solana payment gateway.

## Installation

```bash
pip install onpay
```

## Quick Start

### Create an Invoice

```python
from onpay import OnPay

client = OnPay(secret_key="sk_live_...")

invoice = client.invoices.create(
    amount_decimal="10.00",
    currency="USD",
    label="Coffee",
    memo="Order #1234",
)

print(invoice["paymentUrl"])  # Solana Pay URL for QR rendering
print(invoice["id"])          # Invoice UUID
```

### List Invoices

```python
result = client.invoices.list(status="paid", limit=10)

for inv in result["invoices"]:
    print(f"{inv['id']} - {inv['amount']['formatted']} - {inv['status']}")
```

### Retrieve an Invoice

```python
invoice = client.invoices.retrieve("invoice-uuid-here")
```

### Merchant Profile

```python
# Get profile
merchant = client.merchants.retrieve()

# Update profile
merchant = client.merchants.update(
    business_name="My Coffee Shop",
    preferred_language="en",
)
```

### Webhook Endpoints

```python
# Create a webhook endpoint (secret is returned ONCE)
endpoint = client.webhook_endpoints.create(
    url="https://example.com/webhooks/onpay",
    events=["invoice.paid", "invoice.expired"],
)
print(endpoint["secret"])  # Store this securely

# List endpoints
result = client.webhook_endpoints.list()

# Delete an endpoint
client.webhook_endpoints.delete("endpoint-uuid-here")
```

### Verify Webhook Signatures

```python
from onpay import Webhook, WebhookSignatureError

try:
    event = Webhook.construct_event(
        payload=request.body,
        sig_header=request.headers["OnPay-Signature"],
        secret="whsec_...",
        tolerance=300,  # 5 minutes
    )
    print(event["type"])  # e.g. "invoice.paid"
except WebhookSignatureError as e:
    print(f"Invalid signature: {e.message}")
```

### Error Handling

```python
from onpay import OnPay, OnPayError

client = OnPay(secret_key="sk_live_...")

try:
    invoice = client.invoices.retrieve("nonexistent-id")
except OnPayError as e:
    print(e.status_code)  # 404
    print(e.code)         # "NOT_FOUND"
    print(e.message)      # "Invoice not found"
```

### Context Manager

```python
with OnPay(secret_key="sk_live_...") as client:
    invoice = client.invoices.create(amount_decimal="5.00")
# HTTP client is automatically closed
```

## API Reference

### `OnPay(secret_key, base_url="https://onpay.id", timeout=30.0)`

Main client. All requests include `Authorization: Bearer <secret_key>` and `OnPay-Version: 2026-04-12` headers.

### `client.invoices`

| Method                                                                | Description          |
| --------------------------------------------------------------------- | -------------------- |
| `.create(amount_decimal, currency?, label?, memo?, idempotency_key?)` | Create an invoice    |
| `.retrieve(id)`                                                       | Get a single invoice |
| `.list(status?, limit?, offset?)`                                     | List invoices        |

### `client.merchants`

| Method                                                           | Description          |
| ---------------------------------------------------------------- | -------------------- |
| `.retrieve()`                                                    | Get merchant profile |
| `.update(business_name?, settlement_mint?, preferred_language?)` | Update profile       |

### `client.webhook_endpoints`

| Method                                   | Description     |
| ---------------------------------------- | --------------- |
| `.create(url, events, idempotency_key?)` | Create endpoint |
| `.list()`                                | List endpoints  |
| `.delete(id)`                            | Delete endpoint |

### `Webhook.construct_event(payload, sig_header, secret, tolerance=300)`

Verify webhook signature and return parsed event dict.

## License

MIT
