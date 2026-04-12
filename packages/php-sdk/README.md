# OnPay PHP SDK

Official PHP SDK for the [OnPay](https://pay.onpay.id) Solana payment gateway API.

## Requirements

- PHP 8.1+
- cURL extension
- JSON extension

## Installation

```bash
composer require onpay/onpay-php
```

## Quick Start

### Initialize the Client

```php
use OnPay\OnPay;

$onpay = new OnPay('sk_live_...');
```

### Create an Invoice

```php
$invoice = $onpay->invoices->create([
    'amountDecimal' => '10.00',
    'currency'      => 'USD',
    'label'         => 'Coffee',
    'memo'          => 'Order #1234',
]);

echo $invoice['paymentUrl']; // Solana Pay URL for QR rendering
echo $invoice['id'];         // Invoice UUID
```

### Retrieve an Invoice

```php
$invoice = $onpay->invoices->retrieve('invoice-uuid-here');
echo $invoice['status']; // "pending", "paid", "expired", or "failed"
```

### List Invoices

```php
$result = $onpay->invoices->list([
    'status' => 'paid',
    'limit'  => 10,
    'offset' => 0,
]);

foreach ($result['invoices'] as $invoice) {
    echo $invoice['id'] . ': ' . $invoice['amount']['formatted'] . "\n";
}
```

### Merchant Profile

```php
// Retrieve
$merchant = $onpay->merchants->retrieve();

// Update
$merchant = $onpay->merchants->update([
    'businessName'      => 'My Coffee Shop',
    'preferredLanguage' => 'en',
]);
```

### Webhook Endpoints

```php
// Create (secret is returned ONCE -- store it securely)
$endpoint = $onpay->webhookEndpoints->create([
    'url'    => 'https://example.com/webhooks/onpay',
    'events' => ['invoice.paid', 'invoice.expired'],
]);
$secret = $endpoint['secret'];

// List
$result = $onpay->webhookEndpoints->list();

// Delete
$onpay->webhookEndpoints->delete('endpoint-uuid-here');
```

## Verify Webhooks

Use `OnPay\Webhook` to verify incoming webhook signatures in your handler:

```php
use OnPay\Webhook;
use OnPay\Exceptions\WebhookSignatureException;

$payload   = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_ONPAY_SIGNATURE'];
$secret    = 'your_endpoint_secret';

try {
    $event = Webhook::constructEvent($payload, $sigHeader, $secret);

    // $event is the decoded JSON payload
    // Handle the event based on type (from OnPay-Event-Type header)
    echo 'Received event for invoice: ' . $event['invoiceId'];

} catch (WebhookSignatureException $e) {
    http_response_code(400);
    echo 'Signature verification failed: ' . $e->getMessage();
}
```

## Error Handling

All API errors throw `OnPay\Exceptions\OnPayException`:

```php
use OnPay\Exceptions\OnPayException;

try {
    $invoice = $onpay->invoices->retrieve('nonexistent-id');
} catch (OnPayException $e) {
    echo $e->statusCode;   // 404
    echo $e->errorCode;    // "NOT_FOUND"
    echo $e->errorMessage; // "Invoice not found"
    echo $e->details;      // Additional details (if any)
}
```

## Idempotency

Pass an idempotency key when creating invoices to safely retry on network failures:

```php
$invoice = $onpay->invoices->create(
    ['amountDecimal' => '10.00', 'currency' => 'USD'],
    'unique-request-id-123',
);
```

## License

MIT
