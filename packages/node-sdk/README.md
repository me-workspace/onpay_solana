# @onpay/node

Node.js SDK for the [OnPay](https://onpay.id) Solana payment gateway.

Requires Node.js 18+ (uses built-in `fetch` and `crypto`). Zero runtime dependencies.

## Install

```bash
npm install @onpay/node
```

## Quick Start

### Create an Invoice

```ts
import { OnPay } from "@onpay/node";

const onpay = new OnPay({ secretKey: "sk_live_..." });

const invoice = await onpay.invoices.create({
  amountDecimal: "25.00",
  currency: "USD",
  label: "Order #1234",
  memo: "Thanks for your purchase!",
});

console.log(invoice.paymentUrl); // Solana Pay URL for QR rendering
console.log(invoice.status); // "pending"
```

### List Invoices

```ts
const { invoices } = await onpay.invoices.list({
  status: "paid",
  limit: 10,
});
```

### Retrieve an Invoice

```ts
const invoice = await onpay.invoices.retrieve("invoice-uuid-here");
```

### Merchant Profile

```ts
// Get current profile
const merchant = await onpay.merchants.retrieve();

// Update profile
const updated = await onpay.merchants.update({
  businessName: "My Store",
  preferredLanguage: "en",
});
```

### Webhook Endpoints

```ts
// Create a webhook endpoint (secret is returned only once)
const endpoint = await onpay.webhookEndpoints.create({
  url: "https://example.com/webhooks/onpay",
  events: ["invoice.paid", "invoice.expired"],
});
console.log(endpoint.secret); // Store this securely!

// List endpoints
const { endpoints } = await onpay.webhookEndpoints.list();

// Delete an endpoint
await onpay.webhookEndpoints.delete("endpoint-uuid-here");
```

### Verify a Webhook

```ts
import { OnPay } from "@onpay/node";

// In your webhook handler (e.g. Express):
app.post("/webhooks/onpay", (req, res) => {
  const sig = req.headers["onpay-signature"] as string;
  const endpointSecret = process.env.ONPAY_WEBHOOK_SECRET!;

  try {
    const event = OnPay.webhooks.constructEvent(
      req.body, // raw body string
      sig, // OnPay-Signature header
      endpointSecret, // your endpoint's signing secret
    );

    // Handle the event
    console.log("Received event:", event);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
  }
});
```

### Error Handling

```ts
import { OnPay, OnPayError, isOnPayError } from "@onpay/node";

const onpay = new OnPay({ secretKey: "sk_live_..." });

try {
  await onpay.invoices.retrieve("nonexistent-id");
} catch (err) {
  if (isOnPayError(err)) {
    console.error(err.status); // 404
    console.error(err.code); // "NOT_FOUND"
    console.error(err.message); // "Invoice not found"
    console.error(err.details); // additional context, if any
  }
}
```

### Idempotent Requests

Pass an `idempotencyKey` on create methods to safely retry requests:

```ts
const invoice = await onpay.invoices.create(
  { amountDecimal: "10.00" },
  { idempotencyKey: "order-abc-123" },
);
```

## API Version

The SDK sends `OnPay-Version: 2026-04-12` with every request.

## License

MIT
